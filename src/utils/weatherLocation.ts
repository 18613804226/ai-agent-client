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

/** 天气类提问关键词（只做「要不要定位」的粗筛，误报成本低） */
const WEATHER_QUERY_RE =
  /天气|气温|温度多少|几度|下雨|下雪|降雨|台风|雾霾|空气质量|带伞|防晒|穿什么|会不会淋|凉爽|闷热/

/** 位置缓存 10 分钟：连续追问天气不用每次都开一次 GPS */
const LOCATION_TTL_MS = 10 * 60 * 1000

type LocationCache = { text: string; at: number } | null
let cache: LocationCache = null

/** 输入像问天气才值得发起定位（权限弹窗不能动不动就弹） */
export function looksLikeWeatherQuery(text: string): boolean {
  return WEATHER_QUERY_RE.test(text)
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
