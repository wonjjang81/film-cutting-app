import React, { useState, useEffect } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, TextInputProps } from 'react-native';

export interface ClearableTextInputProps extends TextInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onClear?: () => void;
  containerStyle?: any;
  inputStyle?: any;
  showClearButton?: boolean;
  clearButtonColor?: string;
}

/**
 * x 버튼으로 텍스트를 초기화할 수 있는 TextInput 컴포넌트
 * 
 * 사용 예:
 * ```tsx
 * <ClearableTextInput
 *   value={text}
 *   onChangeText={setText}
 *   placeholder="입력하세요"
 *   showClearButton={text.length > 0}
 *   clearButtonColor={colors.error}
 * />
 * ```
 */
export const ClearableTextInput = React.forwardRef<TextInput, ClearableTextInputProps>(
  (
    {
      value,
      onChangeText,
      onClear,
      containerStyle,
      inputStyle,
      showClearButton = true,
      clearButtonColor = '#EF4444',
      ...textInputProps
    },
    ref
  ) => {
    const [isVisible, setIsVisible] = useState(value.length > 0);

    useEffect(() => {
      setIsVisible(value.length > 0);
    }, [value]);

    const handleClear = () => {
      onChangeText('');
      onClear?.();
    };

    return (
      <View style={[styles.container, containerStyle]}>
        <TextInput
          ref={ref}
          {...textInputProps}
          value={value}
          onChangeText={onChangeText}
          style={[styles.input, inputStyle]}
        />
        {showClearButton && isVisible && (
          <TouchableOpacity
            onPress={handleClear}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.clearButton}
          >
            <Text style={[styles.clearButtonText, { color: clearButtonColor }]}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }
);

ClearableTextInput.displayName = 'ClearableTextInput';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  clearButton: {
    position: 'absolute',
    right: 12,
    padding: 4,
  },
  clearButtonText: {
    fontSize: 20,
    fontWeight: '600',
  },
});
