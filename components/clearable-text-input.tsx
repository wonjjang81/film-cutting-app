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
 * - X 버튼은 input 오른쪽 외부에 배치되어 텍스트와 겹치지 않습니다.
 * - 포커스 시 테두리 색상이 변경되어 현재 활성 입력 필드를 시각적으로 표시합니다.
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
      clearButtonColor = '#9CA3AF',
      focusBorderColor,
      onFocus,
      onBlur,
      style,
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
    const activeBorderColor = focusBorderColor && isFocused ? focusBorderColor : undefined;

    const showBtn = showClearButton && isVisible;

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
            style,
            // X 버튼이 보일 때 오른쪽 패딩 확보 (버튼 너비 28px + 여유 4px)
            showBtn ? { paddingRight: 32 } : undefined,
            activeBorderColor ? { borderColor: activeBorderColor, borderWidth: 2 } : undefined,
          ]}
        />
        {showBtn && (
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
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  clearButton: {
    position: 'absolute',
    right: 6,
    padding: 4,
  },
  clearButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
