/**
 * Babel configuration.
 *
 * `react-native-worklets/plugin` is required by Reanimated 4 and must be the last
 * plugin in the list — it rewrites worklet function bodies and needs to see them after
 * every other transform has run. Animations fail silently at runtime if it is missing
 * or ordered earlier.
 */
module.exports = function babelConfig(api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
  };
};
