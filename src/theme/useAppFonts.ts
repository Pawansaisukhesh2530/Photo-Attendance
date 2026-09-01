import { useFonts } from 'expo-font';

// Imported from per-weight subpaths, NOT from '@expo-google-fonts/inter'.
//
// The package root re-exports all 18 Inter faces (9 weights x roman/italic). Importing
// from it pulls every one of them into the bundle — about 6 MB of font data for the 5
// faces this app actually uses. Deep imports keep only what is referenced.
// Verified via `expo export`: asset count drops from 64 to 21.
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_800ExtraBold } from '@expo-google-fonts/inter/800ExtraBold';

/**
 * Loads the five Inter faces the Stitch type scale depends on.
 *
 * Stitch specifies weights 400/500/600/700/800; each maps to a statically loaded
 * face rather than a numeric `fontWeight`, because Android does not synthesise
 * weights for custom fonts reliably.
 *
 * Returns `[loaded, error]`. The root layout holds the splash screen until this
 * resolves, so no screen ever renders with a fallback system font — which would
 * visibly break fidelity with the Stitch design.
 */
export function useAppFonts(): [boolean, Error | null] {
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  return [loaded, error ?? null];
}
