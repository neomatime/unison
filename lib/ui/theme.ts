// Light or dark for the signed-in workspace. Pure: no directive, no imports.

export type Theme = 'light' | 'dark'

export const THEME_KEY = 'unison:theme'

/** A saved choice wins; with none, follow the device's own setting. */
export function resolveTheme(stored: string | null | undefined, prefersDark: boolean): Theme {
  if (stored === 'dark' || stored === 'light') return stored
  return prefersDark ? 'dark' : 'light'
}

export function otherTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark'
}

/**
 * Runs before the workspace paints, so a viewer who chose dark never sees a light flash. It repeats
 * resolveTheme in plain JavaScript because it runs as an inline script, before any bundle loads.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var s=localStorage.getItem(${JSON.stringify(THEME_KEY)});var d=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}})();`
