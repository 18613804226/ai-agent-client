import React from 'react'
import Svg, { Path, Rect, Line, Circle, Polyline } from 'react-native-svg'

/**
 * 输入栏图标：统一用内联 SVG，不依赖 @expo/vector-icons 的字体加载。
 * 背景：OTA 更新后图标字体偶发加载失败，字形退化成「?」/豆腐块，
 *       inline SVG 没有字体依赖，彻底规避。
 */
export type InputBarIconName =
  | 'plus'
  | 'mic'
  | 'keyboard'
  | 'arrow-up'
  | 'square'
  | 'alert-circle'
  | 'film'
  | 'file-text'
  | 'chevron-right'
  | 'file'
  | 'external-link'
  | 'download'
  | 'check-circle'
  | 'x-circle'
  | 'alert-triangle'
  | 'search'
  | 'x'
  | 'chevron-down'
  | 'arrow-left'

export function InputBarIcon({
  name,
  size = 20,
  color = '#000',
  style
}: {
  name: InputBarIconName
  size?: number
  color?: string
  style?: any
}) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    style
  }

  switch (name) {
    case 'plus':
      return (
        <Svg {...common}>
          <Line x1="12" y1="5" x2="12" y2="19" />
          <Line x1="5" y1="12" x2="19" y2="12" />
        </Svg>
      )
    case 'mic':
      return (
        <Svg {...common}>
          <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <Path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <Line x1="12" y1="19" x2="12" y2="23" />
          <Line x1="8" y1="23" x2="16" y2="23" />
        </Svg>
      )
    case 'keyboard':
      return (
        <Svg {...common}>
          <Rect x="2" y="5" width="20" height="14" rx="2" />
          <Line x1="6" y1="9" x2="6" y2="9.01" />
          <Line x1="10" y1="9" x2="10" y2="9.01" />
          <Line x1="14" y1="9" x2="14" y2="9.01" />
          <Line x1="18" y1="9" x2="18" y2="9.01" />
          <Line x1="7" y1="12" x2="7" y2="12.01" />
          <Line x1="11" y1="12" x2="11" y2="12.01" />
          <Line x1="15" y1="12" x2="15" y2="12.01" />
          <Line x1="19" y1="12" x2="19" y2="12.01" />
          <Line x1="8" y1="15" x2="16" y2="15" />
        </Svg>
      )
    case 'arrow-up':
      return (
        <Svg {...common}>
          <Line x1="12" y1="19" x2="12" y2="5" />
          <Path d="M5 12l7-7 7 7" />
        </Svg>
      )
    case 'square':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
          <Rect x="6" y="6" width="12" height="12" rx="2" />
        </Svg>
      )
    case 'alert-circle':
      return (
        <Svg {...common}>
          <Circle cx="12" cy="12" r="10" />
          <Line x1="12" y1="8" x2="12" y2="12" />
          <Line x1="12" y1="16" x2="12.01" y2="16" />
        </Svg>
      )
    case 'film':
      return (
        <Svg {...common}>
          <Rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
          <Line x1="7" y1="2" x2="7" y2="22" />
          <Line x1="17" y1="2" x2="17" y2="22" />
          <Line x1="2" y1="12" x2="22" y2="12" />
          <Line x1="2" y1="7" x2="7" y2="7" />
          <Line x1="2" y1="17" x2="7" y2="17" />
          <Line x1="17" y1="17" x2="22" y2="17" />
          <Line x1="17" y1="7" x2="22" y2="7" />
        </Svg>
      )
    case 'file-text':
      return (
        <Svg {...common}>
          <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <Polyline points="14 2 14 8 20 8" />
          <Line x1="16" y1="13" x2="8" y2="13" />
          <Line x1="16" y1="17" x2="8" y2="17" />
          <Polyline points="10 9 9 9 8 9" />
        </Svg>
      )
    case 'chevron-right':
      return (
        <Svg {...common}>
          <Polyline points="9 18 15 12 9 6" />
        </Svg>
      )
    case 'file':
      return (
        <Svg {...common}>
          <Path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <Polyline points="13 2 13 9 20 9" />
        </Svg>
      )
    case 'external-link':
      return (
        <Svg {...common}>
          <Path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <Polyline points="15 3 21 3 21 9" />
          <Line x1="10" y1="14" x2="21" y2="3" />
        </Svg>
      )
    case 'download':
      return (
        <Svg {...common}>
          <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <Polyline points="7 10 12 15 17 10" />
          <Line x1="12" y1="15" x2="12" y2="3" />
        </Svg>
      )
    case 'check-circle':
      return (
        <Svg {...common}>
          <Path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <Polyline points="22 4 12 14.01 9 11.01" />
        </Svg>
      )
    case 'x-circle':
      return (
        <Svg {...common}>
          <Circle cx="12" cy="12" r="10" />
          <Line x1="15" y1="9" x2="9" y2="15" />
          <Line x1="9" y1="9" x2="15" y2="15" />
        </Svg>
      )
    case 'alert-triangle':
      return (
        <Svg {...common}>
          <Path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <Line x1="12" y1="9" x2="12" y2="13" />
          <Line x1="12" y1="17" x2="12.01" y2="17" />
        </Svg>
      )
    case 'search':
      return (
        <Svg {...common}>
          <Circle cx="11" cy="11" r="8" />
          <Line x1="21" y1="21" x2="16.65" y2="16.65" />
        </Svg>
      )
    case 'x':
      return (
        <Svg {...common}>
          <Line x1="18" y1="6" x2="6" y2="18" />
          <Line x1="6" y1="6" x2="18" y2="18" />
        </Svg>
      )
    case 'chevron-down':
      return (
        <Svg {...common}>
          <Polyline points="6 9 12 15 18 9" />
        </Svg>
      )
    case 'arrow-left':
      return (
        <Svg {...common}>
          <Line x1="19" y1="12" x2="5" y2="12" />
          <Polyline points="12 19 5 12 12 5" />
        </Svg>
      )
    default:
      return null
  }
}
