import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedOverlay } from '@/components/primitives/AnimatedOverlay';
import { Icon, type IconName } from '@/components/primitives/Icon';
import { AnimatedPressable } from '@/components/primitives/Pressable';
import { SearchField } from '@/components/primitives/SearchField';
import { Text } from '@/components/primitives/Text';
import { palette, radius, spacing, touch } from '@/theme';

export interface SelectionOption {
  id: string;
  label: string;
  description?: string;
  icon?: IconName;
  /** Marks the current value. Shown rather than hidden, so the existing state stays visible. */
  selected?: boolean;
  /** Extra searchable text that is not displayed, e.g. an employee ID. */
  searchText?: string;
}

export interface SelectionSheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  options: SelectionOption[];
  onSelect: (id: string) => void;
  onClose: () => void;
  /** Shows a search field. Enable for anything that can exceed a screenful. */
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
}

/** Beyond this the list is virtualised rather than mapped. */
const MAX_HEIGHT_FRACTION = 0.62;

/**
 * Searchable single-choice sheet, used for every admin assignment picker.
 *
 * Built on `AnimatedOverlay` rather than `@gorhom/bottom-sheet` for three reasons:
 *
 *   - It is declarative (`visible`) rather than ref-driven, which matches how every other overlay
 *     in this app is controlled.
 *   - It inherits the Phase 5 fix for React Native's `Modal` tearing its subtree down before an
 *     exit animation can run, so these sheets close as smoothly as they open. A picker that
 *     vanishes instantly feels broken.
 *   - It has no native gesture dependency, so it behaves identically on web, where the admin area
 *     has to work.
 *
 * Reduced motion is honoured by the overlay: the slide collapses to a single frame while every
 * state stays conveyed by text and icon.
 *
 * Search filters locally over the options the caller supplied. That is correct here because a
 * picker is always given a bounded set — active faculty, or the class catalogue — not an unbounded
 * server-side collection.
 */
export function SelectionSheet({
  visible,
  title,
  subtitle,
  options,
  onSelect,
  onClose,
  searchable = false,
  searchPlaceholder = 'Search',
  emptyMessage = 'Nothing available to choose.',
}: SelectionSheetProps) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (needle.length === 0) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        (option.description ?? '').toLowerCase().includes(needle) ||
        (option.searchText ?? '').toLowerCase().includes(needle),
    );
  }, [options, search]);

  return (
    <AnimatedOverlay
      visible={visible}
      variant="sheet"
      onRequestClose={onClose}
      // Choosing a lecturer is reversible, so a backdrop tap may dismiss. Irreversible actions use
      // ConfirmationModal, whose backdrop is inert.
      onBackdropPress={onClose}
      accessibilityLabel={title}
    >
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text variant="titleLg" color={palette.onSurface}>
              {title}
            </Text>
            {subtitle ? (
              <Text variant="bodyMd" color={palette.onSurfaceVariant}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <AnimatedPressable
            onPress={onClose}
            feedback="opacity"
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={styles.close}
          >
            <Icon name="close" size={22} color={palette.onSurfaceVariant} />
          </AnimatedPressable>
        </View>

        {searchable ? (
          <View style={styles.search}>
            <SearchField
              value={search}
              onChangeText={setSearch}
              placeholder={searchPlaceholder}
            />
          </View>
        ) : null}

        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Text variant="bodyMd" color={palette.onSurfaceVariant} align="center">
              {search.trim().length > 0 ? 'Nothing matches that search.' : emptyMessage}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            style={{ maxHeight: MAX_HEIGHT_FRACTION * 900 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => (
              <AnimatedPressable
                onPress={() => onSelect(item.id)}
                feedback="opacity"
                accessibilityRole="button"
                accessibilityState={{ selected: item.selected ?? false }}
                accessibilityLabel={
                  item.description ? `${item.label}. ${item.description}` : item.label
                }
                style={[styles.option, index < filtered.length - 1 && styles.optionDivider]}
              >
                {item.icon ? (
                  <View style={[styles.well, item.selected && styles.wellSelected]}>
                    <Icon
                      name={item.icon}
                      size={18}
                      color={item.selected ? palette.primary : palette.onSurfaceVariant}
                    />
                  </View>
                ) : null}

                <View style={styles.optionText}>
                  <Text
                    variant="bodyLg"
                    color={item.selected ? palette.primary : palette.onSurface}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                  {item.description ? (
                    <Text variant="labelMd" color={palette.onSurfaceVariant} numberOfLines={1}>
                      {item.description}
                    </Text>
                  ) : null}
                </View>

                {/* Current selection carries a glyph, not just a tint. */}
                {item.selected ? (
                  <Icon name="check" size={20} color={palette.primary} />
                ) : null}
              </AnimatedPressable>
            )}
          />
        )}
      </View>
    </AnimatedOverlay>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  close: {
    width: touch.min,
    height: touch.min,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -spacing.sm,
    marginRight: -spacing.sm,
  },
  search: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  empty: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xl,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    minHeight: touch.large,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  optionDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.outlineVariant,
  },
  well: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.surfaceContainerHigh,
  },
  wellSelected: {
    backgroundColor: palette.primaryFixed,
  },
  optionText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
});
