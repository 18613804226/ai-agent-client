import { useState, useRef, useEffect } from 'react';
import { Platform, Keyboard, Animated } from 'react-native';

export function useKeyboardAnimation() {
  const keyboardHeightAnim = useRef(new Animated.Value(0)).current;
  const [isKeyboardUp, setIsKeyboardUp] = useState(false);

  useEffect(() => {
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const subShow = Keyboard.addListener(showEvent, (e) => {
      setIsKeyboardUp(true);
      Animated.timing(keyboardHeightAnim, {
        toValue: e.endCoordinates.height,
        duration: e.duration || 250,
        useNativeDriver: false,
      }).start();
    });

    const subHide = Keyboard.addListener(hideEvent, (e) => {
      setIsKeyboardUp(false);
      Animated.timing(keyboardHeightAnim, {
        toValue: 0,
        duration: e.duration || 200,
        useNativeDriver: false,
      }).start();
    });

    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [keyboardHeightAnim]);

  return { keyboardHeightAnim, isKeyboardUp };
}
