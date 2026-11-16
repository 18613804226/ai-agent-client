import React from 'react';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export const IconPlus: React.FC<IconProps> = ({
  size = 20, // 榛樿澶у皬璁句负 20锛岃窡涔嬪墠鐨� fontSize 瀵瑰簲
  color = 'white', // 榛樿棰滆壊
  strokeWidth = 2, // 榛樿绾挎潯绮楃粏锛屾瘮鏂囧瓧鐪嬭捣鏉ユ洿绮捐嚧
}) => {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* 鏍囧噯鐨勫姞鍙疯矾寰� */}
      <Path d="M12 5v14M5 12h14" />
    </Svg>
  );
};
// 馃攰 寮€鍚姸鎬侊細鍙戝０鍠囧彮
export const IconSpeakerOn = ({
  size = 20,
  color = 'white',
  strokeWidth = 2,
}: any) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
  </Svg>
);

// 馃攪 鍏抽棴鐘舵€侊細闈欓煶鏂滄潬鍠囧彮
export const IconSpeakerOff = ({
  size = 20,
  color = 'white',
  strokeWidth = 2,
}: IconProps) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Path d="M11 5L6 9H2v6h4l5 4V5z" />
    <Path d="M23 9l-6 6M17 9l6 6" />
  </Svg>
);

// 馃搵 澶嶅埗鍥炬爣
export const IconCopy = ({
  size = 16,
  color = 'currentColor',
  strokeWidth = 2,
}: IconProps) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Path d="M8 8V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
    <Path d="M5 8h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z" />
  </Svg>
);

export const IconCheck = ({
  size = 16,
  color = 'currentColor',
  strokeWidth = 2,
}: IconProps) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Path d="m5 12 4 4L19 6" />
  </Svg>
);

// 鉂� 闂彿鍦嗗湀锛氳亰澶╂皵娉′笅鏂广€屾煡鐪嬬粺璁°€嶅叆鍙�
export const IconHelpCircle = ({
  size = 14,
  color = 'currentColor',
  strokeWidth = 2,
}: IconProps) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <Circle cx="12" cy="12" r="10" />
    <Path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <Line x1="12" y1="17" x2="12.01" y2="17" />
  </Svg>
);

// 侧边栏（面板）图标：圆角方框 + 右侧竖条，用于「关闭/收起侧栏」
export const IconSidebarClose = ({
  size = 16,
  color = 'currentColor',
  strokeWidth = 2,
}: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect
      x="3"
      y="4"
      width="18"
      height="16"
      rx="4.5"
      stroke={color}
      strokeWidth={strokeWidth}
    />
    <Rect x="14.6" y="7.2" width="3.2" height="9.6" rx="1.6" fill={color} />
  </Svg>
);
