import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useEffect } from "react";
import { Platform, Pressable, View } from "react-native";
import { color, radius, space } from "@/theme/tokens";
import { Icon } from "./Icon";
import { T } from "./ui";

export interface MonthYear {
  month: number; // 1-12
  year: number;
}

export const formatMonthYear = (v: MonthYear) =>
  new Date(v.year, v.month - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });

/**
 * Native date picker (system UI on iOS and Android). The parent picks a full date, but only
 * month and year leave this component: the app never stores a child's exact birthday.
 */
export function BirthDatePicker({ value, onChange, label }: { value: MonthYear | null; onChange: (v: MonthYear) => void; label: string }) {
  const max = new Date();
  const min = new Date(max.getFullYear() - 12, 0, 1);
  const date = value ? new Date(value.year, value.month - 1, 15) : new Date(max.getFullYear() - 2, max.getMonth(), 15);
  const set = (d?: Date) => d && onChange({ month: d.getMonth() + 1, year: d.getFullYear() });

  // iOS's compact picker always shows a date, so make the shown date the chosen one; otherwise a
  // parent whose child really was born then can't continue without changing it and back.
  useEffect(() => {
    if (Platform.OS === "ios" && !value) set(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (Platform.OS === "ios") {
    return (
      <View style={{ gap: space.sm }}>
        <T variant="smallStrong" color={color.inkSoft}>
          {label}
        </T>
        <View style={{ alignItems: "flex-start" }}>
          <DateTimePicker
            value={date}
            mode="date"
            display="compact"
            maximumDate={max}
            minimumDate={min}
            accentColor={color.moss}
            onValueChange={(_e, d) => set(d)}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: space.sm }}>
      <T variant="smallStrong" color={color.inkSoft}>
        {label}
      </T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? formatMonthYear(value) : "not set"}`}
        onPress={() =>
          DateTimePickerAndroid.open({ value: date, mode: "date", maximumDate: max, minimumDate: min, onValueChange: (_e, d) => set(d) })
        }
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: 52,
          paddingHorizontal: space.lg,
          borderRadius: radius.inner,
          borderWidth: 1.5,
          borderColor: color.line,
          backgroundColor: pressed ? color.paperDeep : color.card,
        })}
      >
        <T color={value ? color.ink : color.inkMuted}>{value ? formatMonthYear(value) : "Choose a date"}</T>
        <Icon name="chevronRight" size={18} color={color.inkMuted} />
      </Pressable>
    </View>
  );
}
