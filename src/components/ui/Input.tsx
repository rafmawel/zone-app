import React, { forwardRef, useState } from 'react';
import {
  StyleSheet,
  TextInput,
  type TextInputProps,
  TouchableOpacity,
  View,
  type ViewStyle,
} from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { colors } from '@/theme/colors';

export interface InputProps extends TextInputProps {
  togglePassword?: boolean;
  containerStyle?: ViewStyle;
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { togglePassword = false, containerStyle, secureTextEntry, onFocus, onBlur, style, ...rest },
  ref,
) {
  const [focused, setFocused] = useState<boolean>(false);
  const [hidden, setHidden] = useState<boolean>(secureTextEntry === true);

  const effectiveSecure = togglePassword ? hidden : secureTextEntry;

  return (
    <View
      style={[
        styles.wrapper,
        { borderColor: focused ? colors.scoreGreen : colors.border },
        containerStyle,
      ]}
    >
      <TextInput
        ref={ref}
        {...rest}
        secureTextEntry={effectiveSecure}
        placeholderTextColor={colors.text.muted}
        selectionColor={colors.scoreGreen}
        cursorColor={colors.scoreGreen}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[styles.input, style]}
      />
      {togglePassword ? (
        <TouchableOpacity
          onPress={() => setHidden((h) => !h)}
          hitSlop={12}
          activeOpacity={0.7}
          style={styles.toggle}
        >
          {hidden ? (
            <Eye size={20} color={colors.text.secondary} />
          ) : (
            <EyeOff size={20} color={colors.text.secondary} />
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
  },
  input: {
    flex: 1,
    color: colors.text.primary,
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    paddingVertical: 0,
  },
  toggle: { paddingLeft: 8, paddingVertical: 8 },
});
