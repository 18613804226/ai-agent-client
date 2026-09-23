import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

// 定义一个全局变量管理 Toast 状态
let globalSetToast: ((visible: boolean, message: string) => void) | null = null;
let timer: any = null;

export const MyToast = {
    show: (message: string) => {
        if (timer) clearTimeout(timer); // 清除上一次残留的定时器，防止冲突
        if (globalSetToast) {
            globalSetToast(true, message);
            timer = setTimeout(() => {
                if (globalSetToast) globalSetToast(false, '');
            }, 2000);
        }
    },
};

export default function GlobalToastContainer() {
    const [visible, setVisible] = useState(false);
    const [message, setMessage] = useState('');

    // 定义动画透明度和缩放值
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        globalSetToast = (v, m) => {
            if (v) {
                setMessage(m);
                setVisible(true);
                // 渐显动画
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 250,
                    useNativeDriver: true,
                }).start();
            } else {
                // 渐隐动画
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                }).start(() => {
                    setVisible(false); // 动画结束后彻底隐藏
                });
            }
        };
        return () => {
            globalSetToast = null;
            if (timer) clearTimeout(timer);
        };
    }, [fadeAnim]);

    if (!visible && !message) return null;

    return (
        <View style={styles.toastOverlay} pointerEvents="none">
            <Animated.View
                style={[
                    styles.toastBox,
                    {
                        opacity: fadeAnim,
                        transform: [
                            {
                                translateY: fadeAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [20, 0], // 出现时从下方稍微上浮 20 像素
                                }),
                            },
                        ],
                    }
                ]}
            >
                <Text style={styles.toastText}>{message}</Text>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    toastOverlay: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        justifyContent: 'flex-end', // 靠底部
        alignItems: 'center',
        paddingBottom: 100, // 离底部的安全距离
        zIndex: 999999,
    },
    toastBox: {
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
    },
    toastText: {
        color: '#101010',
        fontSize: 14,
    },
});