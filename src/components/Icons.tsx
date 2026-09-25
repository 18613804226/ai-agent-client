import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export const IconPlus: React.FC<IconProps> = ({
  size = 20, // 默认大小设为 20，跟之前的 fontSize 对应
  color = 'white', // 默认颜色
  strokeWidth = 2, // 默认线条粗细，比文字看起来更精致
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
      {/* 标准的加号路径 */}
      <Path d="M12 5v14M5 12h14" />
    </Svg>
  );
};
// 🔊 开启状态：发声喇叭
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

// 🔇 关闭状态：静音斜杠喇叭
export const IconSpeakerOff = ({
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
    <Path d="M11 5L6 9H2v6h4l5 4V5z" />
    <Path d="M23 9l-6 6M17 9l6 6" />
  </Svg>
);
