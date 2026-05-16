import React, { useState, useEffect, useCallback } from 'react';
import { View, TextInput, TouchableOpacity, Text, StyleSheet, TextInputProps } from 'react-native';

export interface ClearableTextInputProps extends TextInputProps {
  value: string;
  onChangeText: (text: string) => void;
  onClear?: () => void;
  containerStyle?: any;
  inputStyle?: any;
  showClearButton?: boolean;
  clearButtonColor?: string;
  /** 포커스 시 테두리 색상. 미설정 시 포커스 시각화 비활성화 */
  focusBorderColor?: string;
}

/**
 * x 버튼으로 텍스트를 초기화할 수 있는 TextInput 컴포넌트
 * 포커스 시 테두리 색상이 변경되어 현재 활성 입력 필드를 시각적으로 표시합니다.
 *
 * 사용 예:
 * ```tsx
 * <ClearableTextInput
 *   value={text}
 *   onChangeText={setText}
 *   placeholder="입력하세요"
 *   focusBorderColor={colors.primary}
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
      focusBorderColor,
      onFocus,
      onBlur,
      ...textInputProps
    },
    ref
  ) => {
    const [isVisible, setIsVisible] = useState(value.length > 0);
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
      setIsVisible(value.length > 0);
    }, [value]);

    const handleClear = () => {
      onChangeText('');
      onClear?.();
    };

    const handleFocus = useCallback((e: any) => {
      setIsFocused(true);
      onFocus?.(e);
    }, [onFocus]);

    const handleBlur = useCallback((e: any) => {
      setIsFocused(false);
      onBlur?.(e);
    }, [onBlur]);

    // 포커스 상태에 따라 테두리 색상 결정
    // focusBorderColor가 설정된 경우에만 포커스 시각화 적용
    const activeBorderColor = focusBorderColor && isFocused ? focusBorderColor : undefined;

    return (
      <View style={[styles.container, containerStyle]}>
        <TextInput
          ref={ref}
          {...textInputProps}
          value={value}
          onChangeText={onChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={[
            styles.input,
            inputStyle,
            activeBorderColor ? { borderColor: activeBorderColor, borderWidth: 2 } : undefined,
          ]}
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
