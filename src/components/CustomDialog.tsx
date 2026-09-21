import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
} from 'react-native';

interface CustomDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  onConfirm: () => void;
  isDarkMode: boolean;
  theme: any;
}

export default function CustomDialog({
  visible,
  title,
  message,
  confirmText = '确定',
  onConfirm,
  isDarkMode,
  theme,
}: CustomDialogProps) {
  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.modalOverlay}>
        <TouchableOpacity 
          style={styles.modalBackdrop} 
          activeOpacity={1} 
          onPress={onConfirm} 
        />
        <View 
          style={[
            styles.dialogCard, 
            { 
              backgroundColor: isDarkMode ? '#1E1F20' : '#FFFFFF', 
              borderColor: theme.border 
            }
          ]}
        >
          <Text style={[styles.dialogTitle, { color: theme.textMain }]}>{title}</Text>
          <Text style={[styles.dialogDesc, { color: theme.textMuted }]}>
            {message}
          </Text>
          <TouchableOpacity 
            style={[styles.dialogBtn, { backgroundColor: theme.historyActiveBg }]}
            onPress={onConfirm}
          >
            <Text style={[styles.dialogBtnText, { color: theme.historyActiveText }]}>
              {confirmText}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  dialogCard: {
    width: '80%',
    maxWidth: 320,
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 10,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  dialogDesc: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  dialogBtn: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
  },
  dialogBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
});