import * as React from 'react';
import { Modal, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';

type Props = {
  options: readonly { id: string; title: string; count: number }[];
  value: string | null;
  onChange(value: string): void;
};

export function SubgroupHighlightSelect({ options, value, onChange }: Props) {
  const [open, setOpen] = React.useState(false);
  const label = (option: Props['options'][number]) => `${option.title} · ${option.count}개`;
  if (Platform.OS === 'web') return React.createElement('select', {
    'aria-label': '소그룹 강조 선택', value: value ?? '',
    onChange: (event: React.ChangeEvent<HTMLSelectElement>) => { if (event.target.value) onChange(event.target.value); },
    style: { width: '100%', minWidth: 0, minHeight: 40, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 7, backgroundColor: '#fff', color: '#0f172a', fontSize: 13 },
  }, React.createElement('option', { value: '', disabled: true }, '소그룹 선택'),
  ...options.map(option => React.createElement('option', { key: option.id, value: option.id }, label(option))));

  return <>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="소그룹 강조 선택" onPress={() => setOpen(true)} style={{ minHeight: 40, justifyContent: 'center', padding: 10, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 7 }}><Text>{options.find(option => option.id === value) ? label(options.find(option => option.id === value)!) : '소그룹 선택'} ▾</Text></TouchableOpacity>
    <Modal visible={open} transparent onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#0006' }}><View style={{ backgroundColor: '#fff', padding: 16, borderRadius: 12, maxHeight: '75%' }}>
        <ScrollView>{options.map(option => <TouchableOpacity key={option.id} accessibilityRole="button" onPress={() => { onChange(option.id); setOpen(false); }} style={{ paddingVertical: 12 }}><Text>{label(option)}</Text></TouchableOpacity>)}</ScrollView>
        <TouchableOpacity accessibilityRole="button" onPress={() => setOpen(false)} style={{ padding: 12 }}><Text>닫기</Text></TouchableOpacity>
      </View></View>
    </Modal>
  </>;
}
