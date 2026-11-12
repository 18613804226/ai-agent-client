import { Platform } from 'react-native'
import type * as LocationTypes from 'expo-location'

/**
 * 「提问天气 → 自动带位置」：
 * 发送前检测输入像在问天气（今天/明天天气、下雨吗、要不要带伞…），
 * 命中才发起定位（触发系统权限弹窗），拿城市名随请求带给服务端；
 * 服务端把它拼进联网检索词和模型上下文，天气回答就是「当地」的。
 *
 * 定位 / 逆地理全部失败（拒绝授权 / 网络问题 / 旧包无原生模块）时
 * 静默降级：返回 ''，照常发送，不让天气功能挡住正常聊天。
 *
 * ⚠️ expo-location 是原生模块，必须**调用时**再 require，不能顶层 import：
 * 旧生产 APK 的原生层里没有它，顶层 import 在模块加载时就执行
 * requireNativeModule，会把整个 bundle 崩掉（白屏）；调用时 require + try
 * 兜底后，旧包只降级不出位置，重新打的 APK 才有完整功能。
 */

/**
 * 天气判定：只认「问当下 / 近期当地天气」。
 *
 * 误报不是低成本 —— 命中就会弹系统定位权限，所以不能只靠一个宽泛词表：
 * 1. 先排除科普 / 写作 / 推荐 / 历史类（「为什么下雨」「防晒霜推荐」
 *    「写一段描写下雨的文字」「全球气温变化趋势」）；
 * 2. 强意图词（天气 / 气温 / 空气质量 / 下雨吗…）单独即可命中；
 * 3. 弱词（几度 / 防晒 / 穿什么 / 降温…）必须同时带时效或当地指向，
 *    否则「空调几度合适」「面试穿什么」也会被当成天气。
 */

/** 明显不是问实时天气：优先排除，避免白白弹定位权限 */
const NON_REALTIME_RE =
  /原理|成因|形成|为什么|为何|历史|趋势|平均|统计|写一段|写一篇|作文|翻译|科普|推荐|排行|哪个好|怎么选|造句|仿写|小说|诗句|成语|设定|设置|是什么意思/

/** 强意图：本身就在问天气状况，不需要额外时效词 */
const STRONG_WEATHER_RE =
  /天气|气温|空气质量|AQI|台风|紫外线|下雨吗|下雪吗|要带伞|带不带伞|会不会下雨|会不会下雪|热不热|冷不冷|风大吗|降温吗|湿度多少|穿短袖|要穿外套/

/** 弱意图：离开时效 / 当地词就可能是别的话题 */
const WEAK_WEATHER_RE =
  /几度|温度多少|下雨|下雪|降雨|雾霾|带伞|防晒|穿什么|凉爽|闷热|紫外线|湿度|降温|升温|冷暖|淋|外套|出门/

/** 时效 / 当地指向：把弱词限定到「现在这边」 */
const TIME_OR_LOCAL_RE =
  /今天|今日|明天|明日|后天|现在|此刻|当前|今晚|今早|早上|上午|下午|傍晚|夜里|这周|本周|周末|近期|未来|接下来|实时|目前|这会儿|会不会|当地|这边|这里|附近|外面|出门/

/** 位置缓存 10 分钟：连续追问天气不用每次都开一次 GPS */
const LOCATION_TTL_MS = 10 * 60 * 1000

type LocationCache = { text: string; at: number } | null
let cache: LocationCache = null

/** 输入像在问当下 / 近期当地天气，才值得发起定位 */
export function looksLikeWeatherQuery(text: string): boolean {
  const t = text.trim()
  if (!t || NON_REALTIME_RE.test(t)) return false
  if (STRONG_WEATHER_RE.test(t)) return true
  return TIME_OR_LOCAL_RE.test(t) && WEAK_WEATHER_RE.test(t)
}

/** 延迟加载 expo-location：旧包（原生层无此模块）返回 null */
function loadLocationModule(): typeof LocationTypes | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-location') as typeof LocationTypes
  } catch {
    return null
  }
}

/** 逆地理结果拼「省 市 区」，去重同级（北京 = region/city 同名） */
function joinPlace(geo: LocationTypes.LocationGeocodedAddress): string {
  const parts = [geo.region, geo.city, geo.district]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
  return [...new Set(parts)].join(' ')
}

/**
 * 获取当前城市名（如「广东省 深圳市 南山区」）。
 * - 未命中天气词 → ''（连权限都不碰）
 * - 命中且缓存有效 → 缓存值（Web 不缓存：浏览器定位权限提示每次都问）
 * - 其余 → 请求权限 → 定位 → 逆地理；任一步失败 → ''（静默降级）
 *
 * Web 端 navigator.geolocation 权限由浏览器管；
 * expo-location 在 web 上同样可用（精度低，城市级足够）。
 */
export async function getCurrentCityForWeather(text: string): Promise<string> {
  if (!looksLikeWeatherQuery(text)) return ''
  if (Platform.OS !== 'web' && cache && Date.now() - cache.at < LOCATION_TTL_MS) {
    return cache.text
  }

  const Location = loadLocationModule()
  if (!Location) return ''

  try {
    const perm = await Location.requestForegroundPermissionsAsync()
    if (!perm.granted) return ''

    // lastKnown 先试：省电且即时；太旧（>10 分钟）再现场定位一次
    let pos: LocationTypes.LocationObject | null =
      await Location.getLastKnownPositionAsync()
    if (!pos || Date.now() - pos.timestamp > LOCATION_TTL_MS) {
      pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced
      })
    }
    if (!pos) return ''

    const geo = await Location.reverseGeocodeAsync({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude
    })
    const city = geo.map(joinPlace).find(Boolean) || ''
    if (!city) return ''

    cache = { text: city, at: Date.now() }
    return city
  } catch (e) {
    // 拒绝授权 / 定位超时 / 逆地理失败：不影响发送，只是不带位置
    console.warn('天气定位失败（已降级为不带位置）:', e)
    return ''
  }
}
