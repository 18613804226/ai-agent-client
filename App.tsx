import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

export default function App() {
  useEffect(() => {
    if (Platform.OS === 'web') {
      const styleId = 'rnw-scrollbar-style';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
        /* 针对 React Native Web 垂直滚动容器 */
        div[class*="r-overflowY-"]::-webkit-scrollbar {
          width: 6px !important;
          height: 6px !important;
        }
        div[class*="r-overflowY-"]::-webkit-scrollbar-track {
          background: transparent !important;
        }
        div[class*="r-overflowY-"]::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3) !important;
          border-radius: 3px !important;
        }
        div[class*="r-overflowY-"]::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.5) !important;
        }
      `;
        document.head.appendChild(style);
      }
    }
  }, []);
  return (
    <View style={styles.container}>
      <Text>Open up App.tsx to start working on your app!</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
