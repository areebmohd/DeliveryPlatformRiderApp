import React, { createContext, useState, useContext, useCallback, ReactNode } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Colors, BorderRadius } from '../theme/colors';

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface AlertOptions {
  title: string;
  message: string;
  buttons?: AlertButton[];
}

interface CustomAlertContextType {
  showAlert: (title: string, message: string, buttons?: AlertButton[]) => void;
}

const CustomAlertContext = createContext<CustomAlertContextType | undefined>(undefined);

export const CustomAlertProvider = ({ children }: { children: ReactNode }) => {
  const [visible, setVisible] = useState(false);
  const [options, setOptions] = useState<AlertOptions | null>(null);
  const fadeAnim = useState(new Animated.Value(0))[0];

  const showAlert = useCallback((title: string, message: string, buttons?: AlertButton[]) => {
    setOptions({ title, message, buttons });
    setVisible(true);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const hideAlert = useCallback(() => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      setVisible(false);
      setOptions(null);
    });
  }, [fadeAnim]);

  const handleButtonPress = useCallback((onPress?: () => void) => {
    hideAlert();
    if (onPress) {
      setTimeout(onPress, 200);
    }
  }, [hideAlert]);

  return (
    <CustomAlertContext.Provider value={{ showAlert }}>
      {children}
      <Modal
        transparent
        visible={visible}
        animationType="none"
        onRequestClose={hideAlert}
      >
        <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
          <View style={styles.alertContainer}>
            <View style={styles.contentContainer}>
              <Text style={styles.title}>{options?.title}</Text>
              <Text style={styles.message}>{options?.message}</Text>
            </View>

            <View style={styles.buttonWrapper}>
              {options?.buttons && options.buttons.length > 0 ? (
                options.buttons.map((btn, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.button,
                      index < options.buttons!.length - 1 && styles.buttonBorder,
                      btn.style === 'destructive' && styles.destructiveButton,
                    ]}
                    onPress={() => handleButtonPress(btn.onPress)}
                  >
                    <Text style={[
                      styles.buttonText,
                      btn.style === 'destructive' ? styles.destructiveText :
                      btn.style === 'cancel' ? styles.cancelText : null,
                    ]}>
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                ))
              ) : (
                <TouchableOpacity
                  style={styles.button}
                  onPress={() => handleButtonPress()}
                >
                  <Text style={styles.buttonText}>OK</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </Animated.View>
      </Modal>
    </CustomAlertContext.Provider>
  );
};

export const useCustomAlert = () => {
  const context = useContext(CustomAlertContext);
  if (!context) {
    throw new Error('useCustomAlert must be used within a CustomAlertProvider');
  }
  return context;
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  alertContainer: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: Colors.white,
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  contentContainer: {
    padding: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: '#495057',
    textAlign: 'center',
    lineHeight: 22,
  },
  buttonWrapper: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#f1f3f5',
  },
  button: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonBorder: {
    borderRightWidth: 1,
    borderRightColor: '#f1f3f5',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  destructiveButton: {},
  destructiveText: {
    color: Colors.danger,
  },
  cancelText: {
    color: Colors.textSecondary,
  },
});
