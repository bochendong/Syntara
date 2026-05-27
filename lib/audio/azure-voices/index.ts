import voices001 from './voices-001.json';
import voices002 from './voices-002.json';
import voices003 from './voices-003.json';
import voices004 from './voices-004.json';
import voices005 from './voices-005.json';
import voices006 from './voices-006.json';
import voices007 from './voices-007.json';
import voices008 from './voices-008.json';
import voices009 from './voices-009.json';
import voices010 from './voices-010.json';
import voices011 from './voices-011.json';
import voices012 from './voices-012.json';
import voices013 from './voices-013.json';
import voices014 from './voices-014.json';
import voices015 from './voices-015.json';
import voices016 from './voices-016.json';
import voices017 from './voices-017.json';
import voices018 from './voices-018.json';
import voices019 from './voices-019.json';
import voices020 from './voices-020.json';
import voices021 from './voices-021.json';
import voices022 from './voices-022.json';
import voices023 from './voices-023.json';
import voices024 from './voices-024.json';
import voices025 from './voices-025.json';
import voices026 from './voices-026.json';
import voices027 from './voices-027.json';
import voices028 from './voices-028.json';
import voices029 from './voices-029.json';

export interface AzureVoiceTag {
  ModelSeries?: string[];
  Source?: string[];
  TailoredScenarios?: string[];
  VoicePersonalities?: string[];
}

export interface AzureVoice {
  Name: string;
  DisplayName: string;
  LocalName: string;
  ShortName: string;
  Gender: string;
  Locale: string;
  LocaleName: string;
  SampleRateHertz: string;
  VoiceType: string;
  Status: string;
  WordsPerMinute?: string;
  StyleList?: string[];
  RolePlayList?: string[];
  SecondaryLocaleList?: string[];
  VoiceTag?: AzureVoiceTag;
}

const azureVoicesData = {
  voices: [
    ...voices001.voices,
    ...voices002.voices,
    ...voices003.voices,
    ...voices004.voices,
    ...voices005.voices,
    ...voices006.voices,
    ...voices007.voices,
    ...voices008.voices,
    ...voices009.voices,
    ...voices010.voices,
    ...voices011.voices,
    ...voices012.voices,
    ...voices013.voices,
    ...voices014.voices,
    ...voices015.voices,
    ...voices016.voices,
    ...voices017.voices,
    ...voices018.voices,
    ...voices019.voices,
    ...voices020.voices,
    ...voices021.voices,
    ...voices022.voices,
    ...voices023.voices,
    ...voices024.voices,
    ...voices025.voices,
    ...voices026.voices,
    ...voices027.voices,
    ...voices028.voices,
    ...voices029.voices,
  ] as AzureVoice[],
};

export default azureVoicesData;
