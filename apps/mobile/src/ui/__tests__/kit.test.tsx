import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../theme';
import { Button } from '../Button';
import { SegmentedControl } from '../SegmentedControl';

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

test('Button fires onPress and shows title', () => {
  const onPress = jest.fn();
  const { getByText } = wrap(<Button title="Save" onPress={onPress} />);
  fireEvent.press(getByText('Save'));
  expect(onPress).toHaveBeenCalledTimes(1);
});

test('Button does not fire when disabled', () => {
  const onPress = jest.fn();
  const { getByText } = wrap(<Button title="Nope" onPress={onPress} disabled />);
  fireEvent.press(getByText('Nope'));
  expect(onPress).not.toHaveBeenCalled();
});

test('SegmentedControl selects a value', () => {
  const onChange = jest.fn();
  const { getByText } = wrap(
    <SegmentedControl
      options={[
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ]}
      value="a"
      onChange={onChange}
    />,
  );
  fireEvent.press(getByText('B'));
  expect(onChange).toHaveBeenCalledWith('b');
});
