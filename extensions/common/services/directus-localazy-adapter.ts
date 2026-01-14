import { getLocalazyLanguages } from '@localazy/languages';
import { LanguageMappingService } from './language-mapping-service';

export class DirectusLocalazyAdapter {
  private static mappingService: LanguageMappingService | null = null;

  /**
   * Initialize the adapter with custom language mappings from settings.
   * Should be called before any transformation operations.
   */
  static initializeMappings(mappingsJson: string): void {
    this.mappingService = new LanguageMappingService(mappingsJson);
  }

  /**
   * Get the current mapping service instance.
   * Returns null if not initialized.
   */
  static getMappingService(): LanguageMappingService | null {
    return this.mappingService;
  }

  /**
   * Clear the current mapping service (useful for testing or resetting state).
   */
  static clearMappings(): void {
    this.mappingService = null;
  }

  static mapDirectusToLocalazySourceLanguage(localazySourceLanguageId: number, directusSourceLanguage: string) {
    const directusSourceLanguageAsLocalazyLanguage = getLocalazyLanguages()
      .find((lang) => lang.localazyId === localazySourceLanguageId)?.locale
  || directusSourceLanguage;
    return directusSourceLanguageAsLocalazyLanguage;
  }

  static mapLocalazyToDirectusSourceLanguage(processedLanguage: string, localazySourceLanguageId: number, directusSourceLanguage: string) {
    const localazySourceLanguage = this.resolveLocalazyLanguageId(localazySourceLanguageId)?.locale;

    if (localazySourceLanguage === processedLanguage) {
      return directusSourceLanguage;
    }
    return processedLanguage;
  }

  /**
   * Transform a Directus language code to Localazy format.
   * Uses custom mapping if available, otherwise falls back to replacing '-' with '_'.
   */
  static transformDirectusToLocalazyLanguage(directusLanguage: string) {
    if (this.mappingService) {
      return this.mappingService.transformDirectusToLocalazy(directusLanguage);
    }
    // Backward compatible fallback
    return directusLanguage.replace('-', '_');
  }

  /**
   * Transform a Localazy language code to Directus preferred format.
   * Uses custom mapping if available, otherwise falls back to replacing '_' with '-'.
   */
  static transformLocalazyToDirectusPreferedFormLanguage(localazyLanguage: string) {
    if (this.mappingService) {
      return this.mappingService.transformLocalazyToDirectus(localazyLanguage);
    }
    // Backward compatible fallback
    return localazyLanguage.replace('_', '-');
  }

  /**
   * Check if a language code has a custom mapping defined.
   */
  static hasCustomMapping(code: string): boolean {
    if (this.mappingService) {
      return this.mappingService.hasCustomMapping(code);
    }
    return false;
  }

  static resolveLocalazyLanguageId(langId: number) {
    return getLocalazyLanguages()
      .find((lang) => lang.localazyId === langId);
  }
}
