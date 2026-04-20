/**
 * src/domain/category/categoryEnum.ts
 *
 * Transaction category catalogue for the Payments Generator (P1-08).
 *
 * ~160 predefined categories covering all common German household and
 * business transaction types, grouped into semantic sections.
 *
 * Design:
 *   - `Category` is a branded string union (not a numeric enum) so that keys
 *     are human-readable in stored data and CSV exports.
 *   - `CATEGORY_META` maps every key to a display label and its group.
 *   - Helper functions provide convenient array access for UI drop-downs.
 *
 * Groups (Gruppen):
 *   EINKOMMEN           Einnahmen / Income
 *   WOHNEN              Wohnkosten / Housing
 *   LEBENSMITTEL        Lebensmittel & Haushalt / Food & Household
 *   KLEIDUNG            Kleidung & Mode / Clothing & Fashion
 *   TRANSPORT           Transport & Fahrzeug / Transport & Vehicle
 *   KOMMUNIKATION       Kommunikation & Medien / Communication & Media
 *   VERSICHERUNG        Versicherungen / Insurance
 *   GESUNDHEIT          Gesundheit & Körperpflege / Health & Personal Care
 *   BILDUNG             Bildung & Weiterbildung / Education
 *   FREIZEIT            Freizeit & Unterhaltung / Leisure & Entertainment
 *   REISEN              Reisen & Urlaub / Travel & Holidays
 *   HAUSHALT            Haushalt & Garten / Household & Garden
 *   KINDER_FAMILIE      Kinder & Familie / Children & Family
 *   SPAREN              Sparen & Investitionen / Savings & Investments
 *   STEUERN             Steuern & Abgaben / Taxes & Fees
 *   FINANZEN            Finanzdienstleistungen / Financial Services
 *   GESCHAEFT           Geschäftliche Ausgaben / Business Expenses
 *   SONSTIGES           Sonstiges / Miscellaneous
 */

// ── Category group ────────────────────────────────────────────────────────────

export type CategoryGroup =
  | 'EINKOMMEN'
  | 'WOHNEN'
  | 'LEBENSMITTEL'
  | 'KLEIDUNG'
  | 'TRANSPORT'
  | 'KOMMUNIKATION'
  | 'VERSICHERUNG'
  | 'GESUNDHEIT'
  | 'BILDUNG'
  | 'FREIZEIT'
  | 'REISEN'
  | 'HAUSHALT'
  | 'KINDER_FAMILIE'
  | 'SPAREN'
  | 'STEUERN'
  | 'FINANZEN'
  | 'GESCHAEFT'
  | 'SONSTIGES';

export const CATEGORY_GROUP_LABELS: Record<CategoryGroup, string> = {
  EINKOMMEN: 'Einkommen',
  WOHNEN: 'Wohnen',
  LEBENSMITTEL: 'Lebensmittel & Haushalt',
  KLEIDUNG: 'Kleidung & Mode',
  TRANSPORT: 'Transport & Fahrzeug',
  KOMMUNIKATION: 'Kommunikation & Medien',
  VERSICHERUNG: 'Versicherungen',
  GESUNDHEIT: 'Gesundheit & Körperpflege',
  BILDUNG: 'Bildung & Weiterbildung',
  FREIZEIT: 'Freizeit & Unterhaltung',
  REISEN: 'Reisen & Urlaub',
  HAUSHALT: 'Haushalt & Garten',
  KINDER_FAMILIE: 'Kinder & Familie',
  SPAREN: 'Sparen & Investitionen',
  STEUERN: 'Steuern & Abgaben',
  FINANZEN: 'Finanzdienstleistungen',
  GESCHAEFT: 'Geschäftliche Ausgaben',
  SONSTIGES: 'Sonstiges',
};

// ── Category keys ─────────────────────────────────────────────────────────────

/**
 * All valid transaction category keys.
 * Use as the `category` field on TransactionEntry and rule definitions.
 */
export type Category =
  // ── EINKOMMEN ──────────────────────────────────────────────────────────────
  | 'Gehalt'
  | 'Nebeneinkommen'
  | 'Rente'
  | 'Zinseinkünfte'
  | 'Kapitalerträge'
  | 'Dividenden'
  | 'Mieteinnahmen'
  | 'Kindergeld'
  | 'Elterngeld'
  | 'Arbeitslosengeld'
  | 'Krankengeld'
  | 'Bafög'
  | 'Erstattung'
  | 'Steuererstattung'
  | 'Kassenärztliche Erstattung'
  | 'Sonstiges Einkommen'
  // ── WOHNEN ────────────────────────────────────────────────────────────────
  | 'Miete'
  | 'Hypothek'
  | 'Nebenkosten: Strom'
  | 'Nebenkosten: Gas'
  | 'Nebenkosten: Wasser'
  | 'Nebenkosten: Heizung'
  | 'Nebenkosten: Müll'
  | 'Haushaltsversicherung'
  | 'Grundsteuer'
  | 'Wohngebäudeversicherung'
  | 'Hausverwaltung'
  | 'Internet'
  | 'Telefon: Festnetz'
  | 'Instandhaltung & Reparatur'
  // ── LEBENSMITTEL ──────────────────────────────────────────────────────────
  | 'Lebensmittel'
  | 'Supermarkt'
  | 'Bäckerei'
  | 'Metzgerei'
  | 'Wochenmarkt'
  | 'Getränke'
  | 'Restaurant'
  | 'Café'
  | 'Fast Food'
  | 'Lieferservice'
  | 'Drogerie'
  | 'Reinigungsmittel'
  | 'Haushaltswaren'
  // ── KLEIDUNG ──────────────────────────────────────────────────────────────
  | 'Kleidung'
  | 'Schuhe'
  | 'Accessoires'
  | 'Sportkleidung'
  | 'Unterwäsche'
  | 'Kinderkleidung'
  // ── TRANSPORT ─────────────────────────────────────────────────────────────
  | 'Kraftstoff: Benzin'
  | 'Kraftstoff: Diesel'
  | 'Kraftstoff: LPG'
  | 'Laden: Elektroauto'
  | 'KfZ-Versicherung'
  | 'KfZ-Steuer'
  | 'KfZ-Wartung & Reparatur'
  | 'KfZ-Zulassung'
  | 'Parkgebühren'
  | 'Mautgebühren'
  | 'ÖPNV'
  | 'Bahnticket'
  | 'Flugticket'
  | 'Taxi & Ride-Sharing'
  | 'Mietwagen'
  | 'Fahrrad'
  | 'Leasing-Rate'
  // ── KOMMUNIKATION ─────────────────────────────────────────────────────────
  | 'Telefon: Handy'
  | 'Streaming: Video'
  | 'Streaming: Musik'
  | 'Streaming: Podcast'
  | 'Gaming: Abo'
  | 'Software-Abonnement'
  | 'Cloud-Dienste'
  | 'Zeitschriften & Zeitungen'
  | 'E-Books'
  | 'Bücher'
  | 'Postgebühren'
  // ── VERSICHERUNG ──────────────────────────────────────────────────────────
  | 'Vers. Person: Krankenversicherung'
  | 'Vers. Person: Lebensversicherung'
  | 'Vers. Person: Unfallversicherung'
  | 'Vers. Person: Berufsunfähigkeit'
  | 'Vers. Person: Pflegeversicherung'
  | 'Vers. Haushalt: Haftpflicht'
  | 'Vers. Haushalt: Hausrat'
  | 'Vers. KfZ: Vollkasko'
  | 'Vers. KfZ: Teilkasko'
  | 'Vers. KfZ: Haftpflicht'
  | 'Vers. Reise: Reisekranken'
  | 'Vers. Reise: Reisegepäck'
  | 'Vers. Tier: Tierkrankenversicherung'
  // ── GESUNDHEIT ────────────────────────────────────────────────────────────
  | 'Apotheke'
  | 'Arzt'
  | 'Zahnarzt'
  | 'Krankenhaus'
  | 'Physiotherapie'
  | 'Psychotherapie'
  | 'Optiker'
  | 'Hörgeräte'
  | 'Fitness-Studio'
  | 'Wellness & Spa'
  | 'Friseur'
  | 'Körperpflege & Kosmetik'
  | 'Vitamine & Nahrungsergänzung'
  // ── BILDUNG ───────────────────────────────────────────────────────────────
  | 'Bildung: Schulmaterial'
  | 'Bildung: Studiengebühren'
  | 'Bildung: Kurs & Seminar'
  | 'Bildung: Sprachkurs'
  | 'Bildung: Fachliteratur'
  | 'Bildung: Nachhilfe'
  | 'Bildung: Kinderbetreuung'
  | 'Bildung: Kindergarten'
  // ── FREIZEIT ──────────────────────────────────────────────────────────────
  | 'Freizeit: Kino'
  | 'Freizeit: Theater & Oper'
  | 'Freizeit: Museum & Ausstellung'
  | 'Freizeit: Konzert & Veranstaltung'
  | 'Freizeit: Sport'
  | 'Freizeit: Hobbys'
  | 'Freizeit: Spielzeug'
  | 'Freizeit: Videospiele'
  | 'Freizeit: Musik & Instrumente'
  | 'Freizeit: Fotografie'
  | 'Freizeit: Basteln & Handwerk'
  | 'Freizeit: Haustier'
  | 'Lotterie & Glücksspiel'
  // ── REISEN ────────────────────────────────────────────────────────────────
  | 'Urlaub: Unterkunft'
  | 'Urlaub: Pauschalreise'
  | 'Urlaub: Camping'
  | 'Urlaub: Aktivitäten & Ausflüge'
  | 'Urlaub: Verpflegung'
  | 'Urlaub: Souvenirs'
  | 'Urlaub: Reisegepäck'
  // ── HAUSHALT ──────────────────────────────────────────────────────────────
  | 'Haushalt: Elektrogeräte'
  | 'Haushalt: Möbel & Einrichtung'
  | 'Haushalt: Küche & Kochen'
  | 'Haushalt: Bad & Sanitär'
  | 'Haushalt: Garten & Balkon'
  | 'Haushalt: Heimwerken & Werkzeug'
  | 'Haushalt: Reinigungsservice'
  | 'Haushalt: Umzug'
  // ── KINDER & FAMILIE ──────────────────────────────────────────────────────
  | 'Kinder: Spielzeug & Spiele'
  | 'Kinder: Schule & Schulmaterial'
  | 'Kinder: Aktivitäten & Kurse'
  | 'Haustiere: Futter'
  | 'Haustiere: Tierarzt'
  | 'Haustiere: Tierbedarf'
  | 'Haustiere: Tierpension'
  | 'Unterhaltszahlungen'
  | 'Geschenke: Familie'
  | 'Geschenke: Freunde'
  // ── SPAREN ────────────────────────────────────────────────────────────────
  | 'Sparen: Tagesgeld'
  | 'Sparen: Festgeld'
  | 'Sparen: Bausparvertrag'
  | 'Sparen: Rentenversicherung'
  | 'Investitionen: Aktien'
  | 'Investitionen: ETF'
  | 'Investitionen: Fonds'
  | 'Investitionen: Anleihen'
  | 'Investitionen: Immobilien'
  | 'Investitionen: Kryptowährungen'
  // ── STEUERN ───────────────────────────────────────────────────────────────
  | 'Steuern: Einkommensteuer'
  | 'Steuern: Kirchensteuer'
  | 'Steuern: Solidaritätszuschlag'
  | 'Steuern: Gewerbesteuer'
  | 'Steuern: Umsatzsteuer'
  | 'Steuern: KfZ-Steuer'
  | 'GEZ: Rundfunkbeitrag'
  | 'Gebühren: Behörden'
  // ── FINANZEN ──────────────────────────────────────────────────────────────
  | 'Bankgebühren'
  | 'Kontoführungsgebühr'
  | 'Zinsen: Darlehen'
  | 'Kredit: Rate'
  | 'Kreditkarte: Jahresgebühr'
  | 'Kreditkarte: Tilgung'
  | 'Depot: Verwaltungsgebühr'
  | 'Geldautomat: Abhebung'
  | 'Überweisung: Ausland'
  // ── GESCHÄFT ──────────────────────────────────────────────────────────────
  | 'Geschäft: Bürobedarf'
  | 'Geschäft: Software & Lizenzen'
  | 'Geschäft: Werbung & Marketing'
  | 'Geschäft: Geschäftsreise'
  | 'Geschäft: Repräsentation'
  | 'Geschäft: Externe Dienstleister'
  | 'Geschäft: Fortbildung'
  // ── SONSTIGES ─────────────────────────────────────────────────────────────
  | 'Spenden'
  | 'Mitgliedsbeiträge'
  | 'Vereinsbeiträge'
  | 'Abonnement: Sonstiges'
  | 'Sonstiges';

// ── Category metadata ─────────────────────────────────────────────────────────

export interface CategoryMeta {
  /** Human-readable display name (German). */
  label: string;
  /** Semantic group this category belongs to. */
  group: CategoryGroup;
}

/**
 * Metadata for every category key.
 * Use this to render category labels in drop-downs and export headers.
 */
export const CATEGORY_META: Record<Category, CategoryMeta> = {
  // ── EINKOMMEN ────────────────────────────────────────────────────────────
  Gehalt: { label: 'Gehalt', group: 'EINKOMMEN' },
  Nebeneinkommen: { label: 'Nebeneinkommen', group: 'EINKOMMEN' },
  Rente: { label: 'Rente', group: 'EINKOMMEN' },
  Zinseinkünfte: { label: 'Zinseinkünfte', group: 'EINKOMMEN' },
  Kapitalerträge: { label: 'Kapitalerträge', group: 'EINKOMMEN' },
  Dividenden: { label: 'Dividenden', group: 'EINKOMMEN' },
  Mieteinnahmen: { label: 'Mieteinnahmen', group: 'EINKOMMEN' },
  Kindergeld: { label: 'Kindergeld', group: 'EINKOMMEN' },
  Elterngeld: { label: 'Elterngeld', group: 'EINKOMMEN' },
  Arbeitslosengeld: { label: 'Arbeitslosengeld', group: 'EINKOMMEN' },
  Krankengeld: { label: 'Krankengeld', group: 'EINKOMMEN' },
  Bafög: { label: 'BAföG', group: 'EINKOMMEN' },
  Erstattung: { label: 'Erstattung', group: 'EINKOMMEN' },
  Steuererstattung: { label: 'Steuererstattung', group: 'EINKOMMEN' },
  'Kassenärztliche Erstattung': { label: 'Kassenärztliche Erstattung', group: 'EINKOMMEN' },
  'Sonstiges Einkommen': { label: 'Sonstiges Einkommen', group: 'EINKOMMEN' },
  // ── WOHNEN ──────────────────────────────────────────────────────────────
  Miete: { label: 'Miete', group: 'WOHNEN' },
  Hypothek: { label: 'Hypothek', group: 'WOHNEN' },
  'Nebenkosten: Strom': { label: 'Nebenkosten: Strom', group: 'WOHNEN' },
  'Nebenkosten: Gas': { label: 'Nebenkosten: Gas', group: 'WOHNEN' },
  'Nebenkosten: Wasser': { label: 'Nebenkosten: Wasser', group: 'WOHNEN' },
  'Nebenkosten: Heizung': { label: 'Nebenkosten: Heizung', group: 'WOHNEN' },
  'Nebenkosten: Müll': { label: 'Nebenkosten: Müll', group: 'WOHNEN' },
  Haushaltsversicherung: { label: 'Haushaltsversicherung', group: 'WOHNEN' },
  Grundsteuer: { label: 'Grundsteuer', group: 'WOHNEN' },
  Wohngebäudeversicherung: { label: 'Wohngebäudeversicherung', group: 'WOHNEN' },
  Hausverwaltung: { label: 'Hausverwaltung', group: 'WOHNEN' },
  Internet: { label: 'Internet', group: 'WOHNEN' },
  'Telefon: Festnetz': { label: 'Telefon: Festnetz', group: 'WOHNEN' },
  'Instandhaltung & Reparatur': { label: 'Instandhaltung & Reparatur', group: 'WOHNEN' },
  // ── LEBENSMITTEL ────────────────────────────────────────────────────────
  Lebensmittel: { label: 'Lebensmittel', group: 'LEBENSMITTEL' },
  Supermarkt: { label: 'Supermarkt', group: 'LEBENSMITTEL' },
  Bäckerei: { label: 'Bäckerei', group: 'LEBENSMITTEL' },
  Metzgerei: { label: 'Metzgerei', group: 'LEBENSMITTEL' },
  Wochenmarkt: { label: 'Wochenmarkt', group: 'LEBENSMITTEL' },
  Getränke: { label: 'Getränke', group: 'LEBENSMITTEL' },
  Restaurant: { label: 'Restaurant', group: 'LEBENSMITTEL' },
  Café: { label: 'Café', group: 'LEBENSMITTEL' },
  'Fast Food': { label: 'Fast Food', group: 'LEBENSMITTEL' },
  Lieferservice: { label: 'Lieferservice', group: 'LEBENSMITTEL' },
  Drogerie: { label: 'Drogerie', group: 'LEBENSMITTEL' },
  Reinigungsmittel: { label: 'Reinigungsmittel', group: 'LEBENSMITTEL' },
  Haushaltswaren: { label: 'Haushaltswaren', group: 'LEBENSMITTEL' },
  // ── KLEIDUNG ────────────────────────────────────────────────────────────
  Kleidung: { label: 'Kleidung', group: 'KLEIDUNG' },
  Schuhe: { label: 'Schuhe', group: 'KLEIDUNG' },
  Accessoires: { label: 'Accessoires', group: 'KLEIDUNG' },
  Sportkleidung: { label: 'Sportkleidung', group: 'KLEIDUNG' },
  Unterwäsche: { label: 'Unterwäsche', group: 'KLEIDUNG' },
  Kinderkleidung: { label: 'Kinderkleidung', group: 'KLEIDUNG' },
  // ── TRANSPORT ───────────────────────────────────────────────────────────
  'Kraftstoff: Benzin': { label: 'Kraftstoff: Benzin', group: 'TRANSPORT' },
  'Kraftstoff: Diesel': { label: 'Kraftstoff: Diesel', group: 'TRANSPORT' },
  'Kraftstoff: LPG': { label: 'Kraftstoff: LPG', group: 'TRANSPORT' },
  'Laden: Elektroauto': { label: 'Laden: Elektroauto', group: 'TRANSPORT' },
  'KfZ-Versicherung': { label: 'KfZ-Versicherung', group: 'TRANSPORT' },
  'KfZ-Steuer': { label: 'KfZ-Steuer', group: 'TRANSPORT' },
  'KfZ-Wartung & Reparatur': { label: 'KfZ-Wartung & Reparatur', group: 'TRANSPORT' },
  'KfZ-Zulassung': { label: 'KfZ-Zulassung', group: 'TRANSPORT' },
  Parkgebühren: { label: 'Parkgebühren', group: 'TRANSPORT' },
  Mautgebühren: { label: 'Mautgebühren', group: 'TRANSPORT' },
  ÖPNV: { label: 'ÖPNV', group: 'TRANSPORT' },
  Bahnticket: { label: 'Bahnticket', group: 'TRANSPORT' },
  Flugticket: { label: 'Flugticket', group: 'TRANSPORT' },
  'Taxi & Ride-Sharing': { label: 'Taxi & Ride-Sharing', group: 'TRANSPORT' },
  Mietwagen: { label: 'Mietwagen', group: 'TRANSPORT' },
  Fahrrad: { label: 'Fahrrad', group: 'TRANSPORT' },
  'Leasing-Rate': { label: 'Leasing-Rate', group: 'TRANSPORT' },
  // ── KOMMUNIKATION ───────────────────────────────────────────────────────
  'Telefon: Handy': { label: 'Telefon: Handy', group: 'KOMMUNIKATION' },
  'Streaming: Video': { label: 'Streaming: Video', group: 'KOMMUNIKATION' },
  'Streaming: Musik': { label: 'Streaming: Musik', group: 'KOMMUNIKATION' },
  'Streaming: Podcast': { label: 'Streaming: Podcast', group: 'KOMMUNIKATION' },
  'Gaming: Abo': { label: 'Gaming: Abo', group: 'KOMMUNIKATION' },
  'Software-Abonnement': { label: 'Software-Abonnement', group: 'KOMMUNIKATION' },
  'Cloud-Dienste': { label: 'Cloud-Dienste', group: 'KOMMUNIKATION' },
  'Zeitschriften & Zeitungen': { label: 'Zeitschriften & Zeitungen', group: 'KOMMUNIKATION' },
  'E-Books': { label: 'E-Books', group: 'KOMMUNIKATION' },
  Bücher: { label: 'Bücher', group: 'KOMMUNIKATION' },
  Postgebühren: { label: 'Postgebühren', group: 'KOMMUNIKATION' },
  // ── VERSICHERUNG ────────────────────────────────────────────────────────
  'Vers. Person: Krankenversicherung': {
    label: 'Vers. Person: Krankenversicherung',
    group: 'VERSICHERUNG',
  },
  'Vers. Person: Lebensversicherung': {
    label: 'Vers. Person: Lebensversicherung',
    group: 'VERSICHERUNG',
  },
  'Vers. Person: Unfallversicherung': {
    label: 'Vers. Person: Unfallversicherung',
    group: 'VERSICHERUNG',
  },
  'Vers. Person: Berufsunfähigkeit': {
    label: 'Vers. Person: Berufsunfähigkeit',
    group: 'VERSICHERUNG',
  },
  'Vers. Person: Pflegeversicherung': {
    label: 'Vers. Person: Pflegeversicherung',
    group: 'VERSICHERUNG',
  },
  'Vers. Haushalt: Haftpflicht': { label: 'Vers. Haushalt: Haftpflicht', group: 'VERSICHERUNG' },
  'Vers. Haushalt: Hausrat': { label: 'Vers. Haushalt: Hausrat', group: 'VERSICHERUNG' },
  'Vers. KfZ: Vollkasko': { label: 'Vers. KfZ: Vollkasko', group: 'VERSICHERUNG' },
  'Vers. KfZ: Teilkasko': { label: 'Vers. KfZ: Teilkasko', group: 'VERSICHERUNG' },
  'Vers. KfZ: Haftpflicht': { label: 'Vers. KfZ: Haftpflicht', group: 'VERSICHERUNG' },
  'Vers. Reise: Reisekranken': { label: 'Vers. Reise: Reisekranken', group: 'VERSICHERUNG' },
  'Vers. Reise: Reisegepäck': { label: 'Vers. Reise: Reisegepäck', group: 'VERSICHERUNG' },
  'Vers. Tier: Tierkrankenversicherung': {
    label: 'Vers. Tier: Tierkrankenversicherung',
    group: 'VERSICHERUNG',
  },
  // ── GESUNDHEIT ──────────────────────────────────────────────────────────
  Apotheke: { label: 'Apotheke', group: 'GESUNDHEIT' },
  Arzt: { label: 'Arzt', group: 'GESUNDHEIT' },
  Zahnarzt: { label: 'Zahnarzt', group: 'GESUNDHEIT' },
  Krankenhaus: { label: 'Krankenhaus', group: 'GESUNDHEIT' },
  Physiotherapie: { label: 'Physiotherapie', group: 'GESUNDHEIT' },
  Psychotherapie: { label: 'Psychotherapie', group: 'GESUNDHEIT' },
  Optiker: { label: 'Optiker', group: 'GESUNDHEIT' },
  Hörgeräte: { label: 'Hörgeräte', group: 'GESUNDHEIT' },
  'Fitness-Studio': { label: 'Fitness-Studio', group: 'GESUNDHEIT' },
  'Wellness & Spa': { label: 'Wellness & Spa', group: 'GESUNDHEIT' },
  Friseur: { label: 'Friseur', group: 'GESUNDHEIT' },
  'Körperpflege & Kosmetik': { label: 'Körperpflege & Kosmetik', group: 'GESUNDHEIT' },
  'Vitamine & Nahrungsergänzung': { label: 'Vitamine & Nahrungsergänzung', group: 'GESUNDHEIT' },
  // ── BILDUNG ─────────────────────────────────────────────────────────────
  'Bildung: Schulmaterial': { label: 'Bildung: Schulmaterial', group: 'BILDUNG' },
  'Bildung: Studiengebühren': { label: 'Bildung: Studiengebühren', group: 'BILDUNG' },
  'Bildung: Kurs & Seminar': { label: 'Bildung: Kurs & Seminar', group: 'BILDUNG' },
  'Bildung: Sprachkurs': { label: 'Bildung: Sprachkurs', group: 'BILDUNG' },
  'Bildung: Fachliteratur': { label: 'Bildung: Fachliteratur', group: 'BILDUNG' },
  'Bildung: Nachhilfe': { label: 'Bildung: Nachhilfe', group: 'BILDUNG' },
  'Bildung: Kinderbetreuung': { label: 'Bildung: Kinderbetreuung', group: 'BILDUNG' },
  'Bildung: Kindergarten': { label: 'Bildung: Kindergarten', group: 'BILDUNG' },
  // ── FREIZEIT ────────────────────────────────────────────────────────────
  'Freizeit: Kino': { label: 'Freizeit: Kino', group: 'FREIZEIT' },
  'Freizeit: Theater & Oper': { label: 'Freizeit: Theater & Oper', group: 'FREIZEIT' },
  'Freizeit: Museum & Ausstellung': { label: 'Freizeit: Museum & Ausstellung', group: 'FREIZEIT' },
  'Freizeit: Konzert & Veranstaltung': {
    label: 'Freizeit: Konzert & Veranstaltung',
    group: 'FREIZEIT',
  },
  'Freizeit: Sport': { label: 'Freizeit: Sport', group: 'FREIZEIT' },
  'Freizeit: Hobbys': { label: 'Freizeit: Hobbys', group: 'FREIZEIT' },
  'Freizeit: Spielzeug': { label: 'Freizeit: Spielzeug', group: 'FREIZEIT' },
  'Freizeit: Videospiele': { label: 'Freizeit: Videospiele', group: 'FREIZEIT' },
  'Freizeit: Musik & Instrumente': { label: 'Freizeit: Musik & Instrumente', group: 'FREIZEIT' },
  'Freizeit: Fotografie': { label: 'Freizeit: Fotografie', group: 'FREIZEIT' },
  'Freizeit: Basteln & Handwerk': { label: 'Freizeit: Basteln & Handwerk', group: 'FREIZEIT' },
  'Freizeit: Haustier': { label: 'Freizeit: Haustier', group: 'FREIZEIT' },
  'Lotterie & Glücksspiel': { label: 'Lotterie & Glücksspiel', group: 'FREIZEIT' },
  // ── REISEN ──────────────────────────────────────────────────────────────
  'Urlaub: Unterkunft': { label: 'Urlaub: Unterkunft', group: 'REISEN' },
  'Urlaub: Pauschalreise': { label: 'Urlaub: Pauschalreise', group: 'REISEN' },
  'Urlaub: Camping': { label: 'Urlaub: Camping', group: 'REISEN' },
  'Urlaub: Aktivitäten & Ausflüge': { label: 'Urlaub: Aktivitäten & Ausflüge', group: 'REISEN' },
  'Urlaub: Verpflegung': { label: 'Urlaub: Verpflegung', group: 'REISEN' },
  'Urlaub: Souvenirs': { label: 'Urlaub: Souvenirs', group: 'REISEN' },
  'Urlaub: Reisegepäck': { label: 'Urlaub: Reisegepäck', group: 'REISEN' },
  // ── HAUSHALT ────────────────────────────────────────────────────────────
  'Haushalt: Elektrogeräte': { label: 'Haushalt: Elektrogeräte', group: 'HAUSHALT' },
  'Haushalt: Möbel & Einrichtung': { label: 'Haushalt: Möbel & Einrichtung', group: 'HAUSHALT' },
  'Haushalt: Küche & Kochen': { label: 'Haushalt: Küche & Kochen', group: 'HAUSHALT' },
  'Haushalt: Bad & Sanitär': { label: 'Haushalt: Bad & Sanitär', group: 'HAUSHALT' },
  'Haushalt: Garten & Balkon': { label: 'Haushalt: Garten & Balkon', group: 'HAUSHALT' },
  'Haushalt: Heimwerken & Werkzeug': {
    label: 'Haushalt: Heimwerken & Werkzeug',
    group: 'HAUSHALT',
  },
  'Haushalt: Reinigungsservice': { label: 'Haushalt: Reinigungsservice', group: 'HAUSHALT' },
  'Haushalt: Umzug': { label: 'Haushalt: Umzug', group: 'HAUSHALT' },
  // ── KINDER & FAMILIE ────────────────────────────────────────────────────
  'Kinder: Spielzeug & Spiele': { label: 'Kinder: Spielzeug & Spiele', group: 'KINDER_FAMILIE' },
  'Kinder: Schule & Schulmaterial': {
    label: 'Kinder: Schule & Schulmaterial',
    group: 'KINDER_FAMILIE',
  },
  'Kinder: Aktivitäten & Kurse': { label: 'Kinder: Aktivitäten & Kurse', group: 'KINDER_FAMILIE' },
  'Haustiere: Futter': { label: 'Haustiere: Futter', group: 'KINDER_FAMILIE' },
  'Haustiere: Tierarzt': { label: 'Haustiere: Tierarzt', group: 'KINDER_FAMILIE' },
  'Haustiere: Tierbedarf': { label: 'Haustiere: Tierbedarf', group: 'KINDER_FAMILIE' },
  'Haustiere: Tierpension': { label: 'Haustiere: Tierpension', group: 'KINDER_FAMILIE' },
  Unterhaltszahlungen: { label: 'Unterhaltszahlungen', group: 'KINDER_FAMILIE' },
  'Geschenke: Familie': { label: 'Geschenke: Familie', group: 'KINDER_FAMILIE' },
  'Geschenke: Freunde': { label: 'Geschenke: Freunde', group: 'KINDER_FAMILIE' },
  // ── SPAREN ──────────────────────────────────────────────────────────────
  'Sparen: Tagesgeld': { label: 'Sparen: Tagesgeld', group: 'SPAREN' },
  'Sparen: Festgeld': { label: 'Sparen: Festgeld', group: 'SPAREN' },
  'Sparen: Bausparvertrag': { label: 'Sparen: Bausparvertrag', group: 'SPAREN' },
  'Sparen: Rentenversicherung': { label: 'Sparen: Rentenversicherung', group: 'SPAREN' },
  'Investitionen: Aktien': { label: 'Investitionen: Aktien', group: 'SPAREN' },
  'Investitionen: ETF': { label: 'Investitionen: ETF', group: 'SPAREN' },
  'Investitionen: Fonds': { label: 'Investitionen: Fonds', group: 'SPAREN' },
  'Investitionen: Anleihen': { label: 'Investitionen: Anleihen', group: 'SPAREN' },
  'Investitionen: Immobilien': { label: 'Investitionen: Immobilien', group: 'SPAREN' },
  'Investitionen: Kryptowährungen': { label: 'Investitionen: Kryptowährungen', group: 'SPAREN' },
  // ── STEUERN ─────────────────────────────────────────────────────────────
  'Steuern: Einkommensteuer': { label: 'Steuern: Einkommensteuer', group: 'STEUERN' },
  'Steuern: Kirchensteuer': { label: 'Steuern: Kirchensteuer', group: 'STEUERN' },
  'Steuern: Solidaritätszuschlag': { label: 'Steuern: Solidaritätszuschlag', group: 'STEUERN' },
  'Steuern: Gewerbesteuer': { label: 'Steuern: Gewerbesteuer', group: 'STEUERN' },
  'Steuern: Umsatzsteuer': { label: 'Steuern: Umsatzsteuer', group: 'STEUERN' },
  'Steuern: KfZ-Steuer': { label: 'Steuern: KfZ-Steuer', group: 'STEUERN' },
  'GEZ: Rundfunkbeitrag': { label: 'GEZ: Rundfunkbeitrag', group: 'STEUERN' },
  'Gebühren: Behörden': { label: 'Gebühren: Behörden', group: 'STEUERN' },
  // ── FINANZEN ────────────────────────────────────────────────────────────
  Bankgebühren: { label: 'Bankgebühren', group: 'FINANZEN' },
  Kontoführungsgebühr: { label: 'Kontoführungsgebühr', group: 'FINANZEN' },
  'Zinsen: Darlehen': { label: 'Zinsen: Darlehen', group: 'FINANZEN' },
  'Kredit: Rate': { label: 'Kredit: Rate', group: 'FINANZEN' },
  'Kreditkarte: Jahresgebühr': { label: 'Kreditkarte: Jahresgebühr', group: 'FINANZEN' },
  'Kreditkarte: Tilgung': { label: 'Kreditkarte: Tilgung', group: 'FINANZEN' },
  'Depot: Verwaltungsgebühr': { label: 'Depot: Verwaltungsgebühr', group: 'FINANZEN' },
  'Geldautomat: Abhebung': { label: 'Geldautomat: Abhebung', group: 'FINANZEN' },
  'Überweisung: Ausland': { label: 'Überweisung: Ausland', group: 'FINANZEN' },
  // ── GESCHÄFT ────────────────────────────────────────────────────────────
  'Geschäft: Bürobedarf': { label: 'Geschäft: Bürobedarf', group: 'GESCHAEFT' },
  'Geschäft: Software & Lizenzen': { label: 'Geschäft: Software & Lizenzen', group: 'GESCHAEFT' },
  'Geschäft: Werbung & Marketing': { label: 'Geschäft: Werbung & Marketing', group: 'GESCHAEFT' },
  'Geschäft: Geschäftsreise': { label: 'Geschäft: Geschäftsreise', group: 'GESCHAEFT' },
  'Geschäft: Repräsentation': { label: 'Geschäft: Repräsentation', group: 'GESCHAEFT' },
  'Geschäft: Externe Dienstleister': {
    label: 'Geschäft: Externe Dienstleister',
    group: 'GESCHAEFT',
  },
  'Geschäft: Fortbildung': { label: 'Geschäft: Fortbildung', group: 'GESCHAEFT' },
  // ── SONSTIGES ───────────────────────────────────────────────────────────
  Spenden: { label: 'Spenden', group: 'SONSTIGES' },
  Mitgliedsbeiträge: { label: 'Mitgliedsbeiträge', group: 'SONSTIGES' },
  Vereinsbeiträge: { label: 'Vereinsbeiträge', group: 'SONSTIGES' },
  'Abonnement: Sonstiges': { label: 'Abonnement: Sonstiges', group: 'SONSTIGES' },
  Sonstiges: { label: 'Sonstiges', group: 'SONSTIGES' },
};

// ── Derived helpers ───────────────────────────────────────────────────────────

/** All category keys as a read-only array (deterministic order). */
export const ALL_CATEGORIES: readonly Category[] = Object.keys(CATEGORY_META) as Category[];

/**
 * Return all categories belonging to the given group.
 *
 * @param group - The category group to filter by.
 */
export function getCategoriesByGroup(group: CategoryGroup): Category[] {
  return ALL_CATEGORIES.filter((c) => CATEGORY_META[c].group === group);
}

/**
 * Return the display label for a category key.
 * Falls back to the raw key string if somehow not found (should not happen).
 */
export function getCategoryLabel(category: Category): string {
  return CATEGORY_META[category]?.label ?? category;
}

/**
 * Type-guard: return true if the given string is a valid Category key.
 */
export function isCategory(value: string): value is Category {
  return Object.prototype.hasOwnProperty.call(CATEGORY_META, value);
}
