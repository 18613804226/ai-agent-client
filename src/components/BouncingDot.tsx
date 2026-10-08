import React, { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

// ===================== BouncingDot =====================
const BouncingDot = memo(function BouncingDot({ color }: { color: string }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 600 }), -1, true);
  }, []);

  const dotStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * -4 }],
    opacity: 0.4 + progress.value * 0.6,
  }));

  return (
    <Animated.View style={[styles.bouncingDot, dotStyle]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  bouncingDot: {
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});

export default BouncingDot;
