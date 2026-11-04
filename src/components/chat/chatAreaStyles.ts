import { StyleSheet } from 'react-native'

// ===================== ChatArea StyleSheet =====================
export const chatAreaStyles = StyleSheet.create({
  scrollContent: {
    padding: 16,
    paddingBottom: 16
  },
  welcomeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none'
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24
  },
  welcomeEmoji: {
    fontSize: 42,
    marginBottom: 12
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center'
  },
  welcomeSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20
  },
  scrollToBottomBtnWrap: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center'
  },
  scrollToBottomBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.15)',
    elevation: 4
  }
})
