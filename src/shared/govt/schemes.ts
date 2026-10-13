/**
 * The scheme directory the Reception shows and the Eligibility desk checks against.
 *
 * These are CENTRAL-government schemes, summarised from their public guidelines. Amounts and
 * rules change and many schemes add their own state top-ups, so every verdict the app gives is
 * a first screening — the official portal always has the last word. `incomeBasis` says whether
 * an income limit is written into the scheme ('official') or is only a practical stand-in for a
 * survey-based test ('indicative').
 */
import type { Area, Category, Gender, Occupation } from './profile';
import type { DocId } from './documents';
import type { L } from './text';

export const SCHEME_CATEGORIES = [
  'agriculture', 'health', 'housing', 'education', 'women_child', 'pension_insurance', 'business', 'employment',
] as const;
export type SchemeCategory = (typeof SCHEME_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<SchemeCategory, L> = {
  agriculture: { en: 'Farmers & Agriculture', hi: 'किसान और कृषि' },
  health: { en: 'Health', hi: 'स्वास्थ्य' },
  housing: { en: 'Housing & Home', hi: 'आवास और घर' },
  education: { en: 'Education & Scholarships', hi: 'शिक्षा और छात्रवृत्ति' },
  women_child: { en: 'Women & Children', hi: 'महिला और बाल' },
  pension_insurance: { en: 'Pension & Insurance', hi: 'पेंशन और बीमा' },
  business: { en: 'Business & Loans', hi: 'व्यवसाय और ऋण' },
  employment: { en: 'Jobs & Skills', hi: 'रोज़गार और कौशल' },
};

/** One condition set. Every field present must hold. */
export interface Rule {
  age?: { min?: number; max?: number };
  gender?: readonly Gender[];
  /** Annual family income ceiling in rupees. */
  maxIncome?: number;
  occupations?: readonly Occupation[];
  excludeOccupations?: readonly Occupation[];
  categories?: readonly Category[];
  area?: Area;
}

/** A question only the citizen can answer; `need` is the answer the scheme requires. */
export interface Question { id: string; text: L; need: 'yes' | 'no' }

export interface Scheme {
  id: string;
  category: SchemeCategory;
  name: L;
  /** One line: what it is. */
  short: L;
  /** What the citizen actually receives. */
  benefit: L;
  ministry: string;
  portal: string;
  docs: readonly DocId[];
  rule: Rule;
  /** At least ONE of these condition sets must hold, on top of `rule` (e.g. "SC/ST or woman"). */
  anyOf?: readonly Rule[];
  anyOfLabel?: L;
  incomeBasis?: 'official' | 'indicative';
  questions?: readonly Question[];
  /** Usual yearly closing dates (month 1-12). Windows move — the notice board always says to confirm. */
  deadlines?: ReadonlyArray<{ month: number; day: number; label: L }>;
  /** Widely applied-for right now — surfaced on the notice board. */
  trending?: boolean;
  /** Words (English, Hindi, common spellings) for matching what a citizen types. */
  tags: readonly string[];
}

const Q = {
  incomeTax: { id: 'income_tax', text: { en: 'Do you or anyone in your family pay income tax?', hi: 'क्या आप या आपके परिवार का कोई सदस्य आयकर देता है?' }, need: 'no' } as Question,
  epfo: { id: 'epfo', text: { en: 'Are you a member of EPFO, NPS or ESIC?', hi: 'क्या आप ईपीएफओ, एनपीएस या ईएसआईसी के सदस्य हैं?' }, need: 'no' } as Question,
  noPucca: { id: 'no_pucca', text: { en: 'Do you (or your spouse / unmarried children) own a pucca (concrete) house anywhere in India?', hi: 'क्या आपके (या पति/पत्नी / अविवाहित बच्चों के) नाम भारत में कहीं पक्का मकान है?' }, need: 'no' } as Question,
  hasLand: { id: 'has_land', text: { en: 'Does your family own cultivable agricultural land?', hi: 'क्या आपके परिवार के पास खेती योग्य ज़मीन है?' }, need: 'yes' } as Question,
  bank: { id: 'bank', text: { en: 'Do you have a bank account linked to Aadhaar?', hi: 'क्या आपका आधार से जुड़ा बैंक खाता है?' }, need: 'yes' } as Question,
};

const NON_AGRI_UNORGANISED: readonly Occupation[] = ['daily_wage', 'farm_labourer', 'street_vendor', 'artisan', 'self_employed'];

export const SCHEMES: readonly Scheme[] = [
  {
    id: 'pm-kisan', category: 'agriculture',
    trending: true,
    name: { en: 'PM-KISAN Samman Nidhi', hi: 'पीएम-किसान सम्मान निधि' },
    short: { en: 'Income support for landholding farmer families.', hi: 'भूमिधारक किसान परिवारों के लिए आय सहायता।' },
    benefit: { en: '₹6,000 a year in three ₹2,000 instalments, paid straight to your bank account.', hi: 'साल में ₹6,000 — तीन किस्तों (₹2,000 प्रत्येक) में सीधे बैंक खाते में।' },
    ministry: 'Ministry of Agriculture & Farmers Welfare', portal: 'https://pmkisan.gov.in',
    docs: ['aadhaar', 'land_record', 'bank_passbook'],
    rule: { occupations: ['farmer'], excludeOccupations: ['govt_job'], age: { min: 18 } },
    questions: [Q.hasLand, Q.incomeTax],
    tags: ['kisan', 'farmer', 'farming', 'land', 'agriculture', 'किसान', 'खेती', 'pm kisan', '6000', 'samman'],
  },
  {
    id: 'pmfby', category: 'agriculture',
    deadlines: [{ month: 7, day: 31, label: { en: 'Kharif enrolment cut-off (usual)', hi: 'खरीफ नामांकन की अंतिम तिथि (आमतौर पर)' } }, { month: 12, day: 15, label: { en: 'Rabi enrolment cut-off (usual)', hi: 'रबी नामांकन की अंतिम तिथि (आमतौर पर)' } }],
    trending: true,
    name: { en: 'PM Fasal Bima Yojana (crop insurance)', hi: 'पीएम फसल बीमा योजना' },
    short: { en: 'Insurance cover against crop loss from weather, pests and disease.', hi: 'मौसम, कीट और रोग से फसल नुकसान का बीमा।' },
    benefit: { en: 'Claim for crop loss at a small farmer premium (2% for kharif, 1.5% for rabi, 5% for cash crops); the rest is paid by the government.', hi: 'फसल नुकसान पर बीमा दावा; किसान का प्रीमियम बहुत कम (खरीफ 2%, रबी 1.5%, नकदी फसल 5%), शेष सरकार देती है।' },
    ministry: 'Ministry of Agriculture & Farmers Welfare', portal: 'https://pmfby.gov.in',
    docs: ['aadhaar', 'land_record', 'bank_passbook'],
    rule: { occupations: ['farmer'], age: { min: 18 } },
    questions: [{ id: 'notified_crop', text: { en: 'Are you growing a notified crop this season in a notified area?', hi: 'क्या आप इस मौसम में अधिसूचित क्षेत्र में अधिसूचित फसल उगा रहे हैं?' }, need: 'yes' }],
    tags: ['crop', 'insurance', 'fasal', 'bima', 'फसल', 'बीमा', 'drought', 'flood', 'loss', 'नुकसान'],
  },
  {
    id: 'kcc', category: 'agriculture',
    name: { en: 'Kisan Credit Card (KCC)', hi: 'किसान क्रेडिट कार्ड (केसीसी)' },
    short: { en: 'Low-interest farm credit for cultivators, tenant farmers, sharecroppers, fishers and dairy farmers.', hi: 'किसानों, बटाईदारों, मछुआरों और पशुपालकों के लिए कम ब्याज का कृषि ऋण।' },
    benefit: { en: 'Credit up to ₹3 lakh at an effective interest of about 4% a year on timely repayment.', hi: '₹3 लाख तक का ऋण; समय पर चुकाने पर प्रभावी ब्याज लगभग 4% वार्षिक।' },
    ministry: 'Ministry of Agriculture & Farmers Welfare / RBI', portal: 'https://pmkisan.gov.in',
    docs: ['aadhaar', 'land_record', 'bank_passbook', 'photo'],
    rule: { occupations: ['farmer'], age: { min: 18, max: 75 } },
    tags: ['kcc', 'credit card', 'kisan credit', 'loan', 'farm loan', 'ऋण', 'किसान क्रेडिट', 'fishermen', 'dairy'],
  },
  {
    id: 'pm-kmy', category: 'pension_insurance',
    name: { en: 'PM Kisan Maandhan (farmer pension)', hi: 'पीएम किसान मानधन (किसान पेंशन)' },
    short: { en: 'Old-age pension for small and marginal farmers.', hi: 'छोटे और सीमांत किसानों के लिए वृद्धावस्था पेंशन।' },
    benefit: { en: '₹3,000 a month pension after age 60; you pay ₹55–200 a month and the government matches it.', hi: '60 वर्ष के बाद ₹3,000 मासिक पेंशन; आप ₹55–200 मासिक देते हैं और सरकार उतना ही जमा करती है।' },
    ministry: 'Ministry of Agriculture & Farmers Welfare', portal: 'https://maandhan.in',
    docs: ['aadhaar', 'land_record', 'bank_passbook'],
    rule: { occupations: ['farmer'], age: { min: 18, max: 40 } },
    questions: [{ id: 'land_2ha', text: { en: 'Is your total cultivable land 2 hectares (about 5 acres) or less?', hi: 'क्या आपकी कुल खेती योग्य ज़मीन 2 हेक्टेयर (लगभग 5 एकड़) या उससे कम है?' }, need: 'yes' }, Q.epfo, Q.incomeTax],
    tags: ['pension', 'maandhan', 'mandhan', 'farmer pension', 'old age', 'पेंशन', 'मानधन', 'kisan pension'],
  },
  {
    id: 'pmjay', category: 'health',
    trending: true,
    name: { en: 'Ayushman Bharat PM-JAY', hi: 'आयुष्मान भारत पीएम-जेएवाई' },
    short: { en: 'Cashless hospital cover for poor and vulnerable families.', hi: 'गरीब और कमज़ोर परिवारों के लिए कैशलेस अस्पताल बीमा।' },
    benefit: { en: 'Health cover of ₹5 lakh per family per year at empanelled government and private hospitals.', hi: 'सूचीबद्ध सरकारी और निजी अस्पतालों में प्रति परिवार प्रति वर्ष ₹5 लाख का स्वास्थ्य कवर।' },
    ministry: 'National Health Authority', portal: 'https://pmjay.gov.in',
    docs: ['aadhaar', 'ration_card', 'residence'],
    rule: { maxIncome: 250_000, excludeOccupations: ['govt_job'] },
    incomeBasis: 'indicative',
    questions: [{ id: 'secc_listed', text: { en: 'Is your family on the Ayushman Bharat / SECC beneficiary list (check at mera.pmjay.gov.in) or do you hold an AAY / priority ration card?', hi: 'क्या आपका परिवार आयुष्मान भारत / एसईसीसी लाभार्थी सूची में है (mera.pmjay.gov.in पर देखें) या आपके पास अंत्योदय / प्राथमिकता राशन कार्ड है?' }, need: 'yes' }],
    tags: ['ayushman', 'health', 'hospital', 'insurance', 'medical', 'treatment', 'आयुष्मान', 'स्वास्थ्य', 'इलाज', 'अस्पताल', 'golden card', '5 lakh'],
  },
  {
    id: 'pmjay-vvy', category: 'health',
    name: { en: 'Ayushman Vay Vandana (age 70+)', hi: 'आयुष्मान वय वंदना (70+ आयु)' },
    short: { en: 'Free hospital cover for every senior citizen aged 70 or more — any income.', hi: '70 वर्ष या उससे अधिक आयु के हर वरिष्ठ नागरिक के लिए मुफ़्त अस्पताल कवर — किसी भी आय पर।' },
    benefit: { en: '₹5 lakh per family per year, shared by all 70+ members of the family, with no income test.', hi: 'परिवार के सभी 70+ सदस्यों के लिए प्रति परिवार प्रति वर्ष ₹5 लाख, आय की कोई शर्त नहीं।' },
    ministry: 'National Health Authority', portal: 'https://pmjay.gov.in',
    docs: ['aadhaar', 'age_proof'],
    rule: { age: { min: 70 } },
    tags: ['senior', 'old age', 'vay vandana', 'elderly', '70', 'वृद्ध', 'बुजुर्ग', 'वय वंदना', 'health'],
  },
  {
    id: 'pmay-g', category: 'housing',
    trending: true,
    name: { en: 'PM Awas Yojana – Gramin', hi: 'प्रधानमंत्री आवास योजना – ग्रामीण' },
    short: { en: 'Pucca house assistance for houseless and kutcha-house rural families.', hi: 'बेघर और कच्चे मकान वाले ग्रामीण परिवारों के लिए पक्का घर।' },
    benefit: { en: '₹1.20 lakh (₹1.30 lakh in hilly / difficult areas) to build a house, plus ₹12,000 for a toilet and 90–95 days of paid work.', hi: 'घर बनाने को ₹1.20 लाख (पहाड़ी/दुर्गम क्षेत्रों में ₹1.30 लाख), शौचालय के लिए ₹12,000 और 90–95 दिन की मज़दूरी।' },
    ministry: 'Ministry of Rural Development', portal: 'https://pmayg.nic.in',
    docs: ['aadhaar', 'bank_passbook', 'residence', 'job_card'],
    rule: { area: 'rural', maxIncome: 180_000, age: { min: 18 } },
    incomeBasis: 'indicative',
    questions: [{ id: 'no_pucca', text: { en: 'Do you live without a house, or in a kutcha / one-room house, and own no pucca house?', hi: 'क्या आप बेघर हैं या कच्चे / एक कमरे के मकान में रहते हैं और आपके पास पक्का मकान नहीं है?' }, need: 'yes' }],
    tags: ['house', 'home', 'awas', 'awaas', 'housing', 'pucca', 'rural house', 'आवास', 'घर', 'मकान', 'pmay'],
  },
  {
    id: 'pmay-u', category: 'housing',
    trending: true,
    name: { en: 'PM Awas Yojana – Urban 2.0', hi: 'प्रधानमंत्री आवास योजना – शहरी 2.0' },
    short: { en: 'Help to build or buy a first home for urban EWS, LIG and MIG families.', hi: 'शहरी ईडब्ल्यूएस, एलआईजी और एमआईजी परिवारों को पहला घर बनाने या खरीदने में मदद।' },
    benefit: { en: 'Central assistance of up to ₹2.5 lakh to build a house, or an interest subsidy (up to ₹1.8 lakh) on a home loan.', hi: 'घर बनाने के लिए ₹2.5 लाख तक की केंद्रीय सहायता, या गृह ऋण पर ब्याज सब्सिडी (₹1.8 लाख तक)।' },
    ministry: 'Ministry of Housing & Urban Affairs', portal: 'https://pmay-urban.gov.in',
    docs: ['aadhaar', 'income_cert', 'bank_passbook', 'residence', 'photo'],
    rule: { area: 'urban', maxIncome: 900_000, age: { min: 18 } },
    incomeBasis: 'official',
    questions: [Q.noPucca],
    tags: ['house', 'home', 'urban housing', 'home loan', 'interest subsidy', 'ews', 'lig', 'mig', 'आवास', 'घर', 'गृह ऋण', 'pmay'],
  },
  {
    id: 'pmuy', category: 'women_child',
    trending: true,
    name: { en: 'PM Ujjwala Yojana (free LPG connection)', hi: 'प्रधानमंत्री उज्ज्वला योजना (मुफ़्त एलपीजी कनेक्शन)' },
    short: { en: 'LPG connection for adult women from poor households.', hi: 'गरीब परिवारों की वयस्क महिलाओं के लिए एलपीजी कनेक्शन।' },
    benefit: { en: 'A deposit-free LPG connection in the woman\'s name, with a targeted subsidy on refills.', hi: 'महिला के नाम पर बिना जमा राशि का एलपीजी कनेक्शन, रिफिल पर लक्षित सब्सिडी।' },
    ministry: 'Ministry of Petroleum & Natural Gas', portal: 'https://www.pmuy.gov.in',
    docs: ['aadhaar', 'ration_card', 'bpl_card', 'bank_passbook', 'photo'],
    rule: { gender: ['female'], age: { min: 18 }, maxIncome: 250_000 },
    incomeBasis: 'indicative',
    questions: [{ id: 'has_lpg', text: { en: 'Does your household already have an LPG connection?', hi: 'क्या आपके घर में पहले से एलपीजी कनेक्शन है?' }, need: 'no' }],
    tags: ['lpg', 'gas', 'cylinder', 'ujjwala', 'cooking', 'उज्ज्वला', 'गैस', 'सिलेंडर', 'women'],
  },
  {
    id: 'sukanya', category: 'women_child',
    name: { en: 'Sukanya Samriddhi Yojana', hi: 'सुकन्या समृद्धि योजना' },
    short: { en: 'High-interest savings account for a girl child\'s education and marriage.', hi: 'बालिका की पढ़ाई और विवाह के लिए ऊँची ब्याज दर वाला बचत खाता।' },
    benefit: { en: 'Government-set interest (around 8% a year, tax-free), from ₹250 a year up to ₹1.5 lakh; matures when she is 21.', hi: 'सरकार-निर्धारित ब्याज (लगभग 8% वार्षिक, कर-मुक्त); ₹250 से ₹1.5 लाख प्रति वर्ष जमा; बेटी के 21 वर्ष की होने पर परिपक्व।' },
    ministry: 'Ministry of Finance / India Post', portal: 'https://www.indiapost.gov.in',
    docs: ['aadhaar', 'age_proof', 'residence', 'photo'],
    rule: { age: { min: 18 } },
    questions: [{ id: 'girl_under_10', text: { en: 'Do you have a daughter below 10 years of age (and fewer than two Sukanya accounts in the family)?', hi: 'क्या आपकी 10 वर्ष से कम आयु की बेटी है (और परिवार में दो से कम सुकन्या खाते हैं)?' }, need: 'yes' }],
    tags: ['sukanya', 'girl', 'daughter', 'beti', 'savings', 'सुकन्या', 'बेटी', 'बालिका', 'ssy'],
  },
  {
    id: 'matru-vandana', category: 'women_child',
    name: { en: 'PM Matru Vandana Yojana', hi: 'प्रधानमंत्री मातृ वंदना योजना' },
    short: { en: 'Cash support for pregnant and nursing mothers.', hi: 'गर्भवती और स्तनपान कराने वाली माताओं के लिए नकद सहायता।' },
    benefit: { en: '₹5,000 in two instalments for the first living child, and ₹6,000 if the second child is a girl.', hi: 'पहले जीवित बच्चे के लिए दो किस्तों में ₹5,000, और दूसरी संतान बेटी हो तो ₹6,000।' },
    ministry: 'Ministry of Women & Child Development', portal: 'https://pmmvy.wcd.gov.in',
    docs: ['aadhaar', 'bank_passbook', 'mcp_card'],
    rule: { gender: ['female'], age: { min: 19 }, excludeOccupations: ['govt_job'] },
    questions: [{ id: 'pregnant', text: { en: 'Are you pregnant, or nursing a child under 6 months?', hi: 'क्या आप गर्भवती हैं या 6 महीने से छोटे बच्चे को स्तनपान करा रही हैं?' }, need: 'yes' }],
    tags: ['pregnant', 'pregnancy', 'mother', 'maternity', 'matru', 'baby', 'गर्भवती', 'मातृ', 'प्रसव', 'delivery'],
  },
  {
    id: 'apy', category: 'pension_insurance',
    trending: true,
    name: { en: 'Atal Pension Yojana', hi: 'अटल पेंशन योजना' },
    short: { en: 'Guaranteed monthly pension after 60 for workers in the unorganised sector.', hi: 'असंगठित क्षेत्र के कामगारों के लिए 60 वर्ष के बाद गारंटीशुदा मासिक पेंशन।' },
    benefit: { en: 'Pension of ₹1,000–₹5,000 a month from age 60, depending on what you save from age 18–40.', hi: '60 वर्ष से ₹1,000–₹5,000 मासिक पेंशन, जो 18–40 वर्ष में आपकी बचत पर निर्भर है।' },
    ministry: 'Ministry of Finance / PFRDA', portal: 'https://www.npstrust.org.in',
    docs: ['aadhaar', 'bank_passbook'],
    rule: { age: { min: 18, max: 40 } },
    questions: [Q.bank, Q.incomeTax],
    tags: ['pension', 'atal', 'retirement', 'old age', 'अटल', 'पेंशन', 'unorganised'],
  },
  {
    id: 'pmjjby', category: 'pension_insurance',
    name: { en: 'PM Jeevan Jyoti Bima Yojana', hi: 'प्रधानमंत्री जीवन ज्योति बीमा योजना' },
    short: { en: 'Low-cost life insurance for 18–50 year olds.', hi: '18–50 वर्ष के लोगों के लिए कम लागत का जीवन बीमा।' },
    benefit: { en: '₹2 lakh life cover for ₹436 a year, auto-debited from your bank account.', hi: '₹436 वार्षिक प्रीमियम पर ₹2 लाख का जीवन बीमा, बैंक खाते से स्वतः कटता है।' },
    ministry: 'Ministry of Finance', portal: 'https://jansuraksha.gov.in',
    docs: ['aadhaar', 'bank_passbook'],
    rule: { age: { min: 18, max: 50 } },
    questions: [Q.bank],
    tags: ['life insurance', 'jeevan jyoti', 'bima', 'insurance', 'जीवन ज्योति', 'बीमा', 'death cover'],
  },
  {
    id: 'pmsby', category: 'pension_insurance',
    name: { en: 'PM Suraksha Bima Yojana', hi: 'प्रधानमंत्री सुरक्षा बीमा योजना' },
    short: { en: 'Accident insurance for 18–70 year olds.', hi: '18–70 वर्ष के लोगों के लिए दुर्घटना बीमा।' },
    benefit: { en: '₹2 lakh for accidental death or total disability (₹1 lakh for partial) for just ₹20 a year.', hi: 'दुर्घटना में मृत्यु या पूर्ण विकलांगता पर ₹2 लाख (आंशिक पर ₹1 लाख), केवल ₹20 वार्षिक में।' },
    ministry: 'Ministry of Finance', portal: 'https://jansuraksha.gov.in',
    docs: ['aadhaar', 'bank_passbook'],
    rule: { age: { min: 18, max: 70 } },
    questions: [Q.bank],
    tags: ['accident', 'suraksha bima', 'disability', 'insurance', 'सुरक्षा बीमा', 'दुर्घटना', '20 rupees'],
  },
  {
    id: 'nsap-oap', category: 'pension_insurance',
    name: { en: 'Indira Gandhi National Old Age Pension (NSAP)', hi: 'इंदिरा गांधी राष्ट्रीय वृद्धावस्था पेंशन (एनएसएपी)' },
    short: { en: 'Monthly pension for poor senior citizens.', hi: 'गरीब वरिष्ठ नागरिकों के लिए मासिक पेंशन।' },
    benefit: { en: 'Central pension of ₹200 a month (age 60–79) and ₹500 (age 80+); most states add their own top-up.', hi: 'केंद्र की ओर से ₹200 मासिक (60–79 वर्ष) और ₹500 (80+); अधिकांश राज्य अपनी राशि जोड़ते हैं।' },
    ministry: 'Ministry of Rural Development', portal: 'https://nsap.nic.in',
    docs: ['aadhaar', 'age_proof', 'bpl_card', 'bank_passbook', 'photo'],
    rule: { age: { min: 60 }, maxIncome: 120_000 },
    incomeBasis: 'indicative',
    tags: ['old age pension', 'senior', 'elderly', 'vridha', 'वृद्धावस्था', 'पेंशन', 'बुजुर्ग', 'nsap', 'bpl'],
  },
  {
    id: 'pm-svanidhi', category: 'business',
    name: { en: 'PM SVANidhi (street vendor loan)', hi: 'पीएम स्वनिधि (रेहड़ी-पटरी ऋण)' },
    short: { en: 'Collateral-free working-capital loans for street vendors.', hi: 'रेहड़ी-पटरी वालों के लिए बिना गारंटी कार्यशील पूँजी ऋण।' },
    benefit: { en: 'Loans starting at about ₹10,000–15,000 and rising in steps to ₹50,000 on timely repayment, with an interest subsidy and digital-payment cashback.', hi: 'लगभग ₹10,000–15,000 से शुरू होकर समय पर चुकाने पर ₹50,000 तक के ऋण, ब्याज सब्सिडी और डिजिटल भुगतान कैशबैक के साथ।' },
    ministry: 'Ministry of Housing & Urban Affairs', portal: 'https://pmsvanidhi.mohua.gov.in',
    docs: ['aadhaar', 'business_proof', 'bank_passbook', 'photo'],
    rule: { occupations: ['street_vendor'], age: { min: 18 } },
    tags: ['vendor', 'street vendor', 'rehri', 'thela', 'hawker', 'swanidhi', 'svanidhi', 'स्वनिधि', 'रेहड़ी', 'पटरी', 'ठेला'],
  },
  {
    id: 'pm-vishwakarma', category: 'business',
    trending: true,
    name: { en: 'PM Vishwakarma', hi: 'पीएम विश्वकर्मा' },
    short: { en: 'Recognition, training, tools and credit for traditional artisans and craftspeople.', hi: 'पारंपरिक कारीगरों और शिल्पकारों के लिए पहचान, प्रशिक्षण, औज़ार और ऋण।' },
    benefit: { en: 'ID card and certificate, skill training with ₹500 a day stipend, ₹15,000 toolkit grant and collateral-free loans (₹1 lakh, then ₹2 lakh) at 5%.', hi: 'पहचान पत्र और प्रमाणपत्र, ₹500 प्रतिदिन वजीफ़े के साथ प्रशिक्षण, ₹15,000 का टूलकिट अनुदान और 5% पर बिना गारंटी ऋण (₹1 लाख, फिर ₹2 लाख)।' },
    ministry: 'Ministry of MSME', portal: 'https://pmvishwakarma.gov.in',
    docs: ['aadhaar', 'business_proof', 'bank_passbook', 'photo'],
    rule: { occupations: ['artisan'], age: { min: 18 }, excludeOccupations: ['govt_job'] },
    tags: ['artisan', 'craft', 'carpenter', 'blacksmith', 'potter', 'tailor', 'weaver', 'mochi', 'barber', 'vishwakarma', 'विश्वकर्मा', 'कारीगर', 'बढ़ई', 'लोहार', 'कुम्हार', 'दर्जी'],
  },
  {
    id: 'mudra', category: 'business',
    trending: true,
    name: { en: 'PM MUDRA Yojana', hi: 'प्रधानमंत्री मुद्रा योजना' },
    short: { en: 'Collateral-free business loans for small non-farm enterprises.', hi: 'छोटे गैर-कृषि उद्यमों के लिए बिना गारंटी व्यावसायिक ऋण।' },
    benefit: { en: 'Loans from ₹50,000 (Shishu) through Kishor and Tarun up to ₹20 lakh (Tarun Plus), without collateral.', hi: '₹50,000 (शिशु) से किशोर और तरुण होते हुए ₹20 लाख (तरुण प्लस) तक बिना गारंटी ऋण।' },
    ministry: 'Ministry of Finance', portal: 'https://www.mudra.org.in',
    docs: ['aadhaar', 'pan', 'bank_passbook', 'business_proof', 'photo', 'residence'],
    rule: { occupations: ['self_employed', 'street_vendor', 'artisan', 'unemployed', 'homemaker', 'private_job'], age: { min: 18 } },
    questions: [{ id: 'business_plan', text: { en: 'Do you run, or have a plan for, a small business in manufacturing, trading or services (not farming)?', hi: 'क्या आप विनिर्माण, व्यापार या सेवा (खेती नहीं) का छोटा व्यवसाय चलाते हैं या उसकी योजना है?' }, need: 'yes' }],
    tags: ['mudra', 'business loan', 'loan', 'shop', 'startup', 'self employed', 'मुद्रा', 'व्यवसाय', 'दुकान', 'ऋण', 'लोन'],
  },
  {
    id: 'standup-india', category: 'business',
    name: { en: 'Stand-Up India', hi: 'स्टैंड-अप इंडिया' },
    short: { en: 'Bank loans for first-time SC/ST and women entrepreneurs.', hi: 'पहली बार उद्यम शुरू करने वाले एससी/एसटी और महिला उद्यमियों के लिए बैंक ऋण।' },
    benefit: { en: 'A bank loan between ₹10 lakh and ₹1 crore for a new (greenfield) manufacturing, services or trading enterprise.', hi: 'नए (ग्रीनफ़ील्ड) विनिर्माण, सेवा या व्यापार उद्यम के लिए ₹10 लाख से ₹1 करोड़ तक का बैंक ऋण।' },
    ministry: 'Department of Financial Services', portal: 'https://www.standupmitra.in',
    docs: ['aadhaar', 'pan', 'caste_cert', 'business_proof', 'bank_passbook', 'residence', 'photo'],
    rule: { age: { min: 18 } },
    anyOf: [{ categories: ['sc', 'st'] }, { gender: ['female'] }],
    anyOfLabel: { en: 'belong to SC/ST or be a woman', hi: 'एससी/एसटी वर्ग से हों या महिला हों' },
    questions: [{ id: 'greenfield', text: { en: 'Is this a brand-new enterprise (first-time venture), and are you free of any bank default?', hi: 'क्या यह बिल्कुल नया उद्यम है और आप किसी बैंक के डिफ़ॉल्टर नहीं हैं?' }, need: 'yes' }],
    tags: ['standup', 'stand up', 'entrepreneur', 'women entrepreneur', 'sc st', 'business', 'स्टैंड अप', 'उद्यमी', 'महिला उद्यमी'],
  },
  {
    id: 'scholarship-sc', category: 'education',
    deadlines: [{ month: 10, day: 31, label: { en: 'National Scholarship Portal — usual fresh-application window', hi: 'नेशनल स्कॉलरशिप पोर्टल — आमतौर पर नए आवेदन की अंतिम तिथि' } }],
    name: { en: 'Post-Matric Scholarship for SC students', hi: 'अनुसूचित जाति छात्रों के लिए पोस्ट-मैट्रिक छात्रवृत्ति' },
    short: { en: 'Fee and maintenance support for SC students studying after Class 10.', hi: 'कक्षा 10 के बाद पढ़ रहे एससी छात्रों के लिए फीस और रखरखाव सहायता।' },
    benefit: { en: 'Course fees paid plus a monthly maintenance allowance, directly to the student\'s bank account.', hi: 'पाठ्यक्रम की फीस और मासिक रखरखाव भत्ता, सीधे छात्र के बैंक खाते में।' },
    ministry: 'Ministry of Social Justice & Empowerment', portal: 'https://scholarships.gov.in',
    docs: ['aadhaar', 'caste_cert', 'income_cert', 'student_proof', 'bank_passbook', 'photo'],
    rule: { occupations: ['student'], categories: ['sc'], maxIncome: 250_000 },
    incomeBasis: 'official',
    tags: ['scholarship', 'sc', 'scheduled caste', 'student', 'post matric', 'fees', 'छात्रवृत्ति', 'अनुसूचित जाति', 'विद्यार्थी', 'nsp'],
  },
  {
    id: 'scholarship-st', category: 'education',
    deadlines: [{ month: 10, day: 31, label: { en: 'National Scholarship Portal — usual fresh-application window', hi: 'नेशनल स्कॉलरशिप पोर्टल — आमतौर पर नए आवेदन की अंतिम तिथि' } }],
    name: { en: 'Post-Matric Scholarship for ST students', hi: 'अनुसूचित जनजाति छात्रों के लिए पोस्ट-मैट्रिक छात्रवृत्ति' },
    short: { en: 'Fee and maintenance support for ST students studying after Class 10.', hi: 'कक्षा 10 के बाद पढ़ रहे एसटी छात्रों के लिए फीस और रखरखाव सहायता।' },
    benefit: { en: 'Compulsory fees paid plus a monthly maintenance allowance, directly to the student.', hi: 'अनिवार्य शुल्क और मासिक रखरखाव भत्ता, सीधे छात्र को।' },
    ministry: 'Ministry of Tribal Affairs', portal: 'https://scholarships.gov.in',
    docs: ['aadhaar', 'caste_cert', 'income_cert', 'student_proof', 'bank_passbook', 'photo'],
    rule: { occupations: ['student'], categories: ['st'], maxIncome: 250_000 },
    incomeBasis: 'official',
    tags: ['scholarship', 'st', 'scheduled tribe', 'tribal', 'student', 'छात्रवृत्ति', 'जनजाति', 'आदिवासी', 'nsp'],
  },
  {
    id: 'yasasvi-obc', category: 'education',
    deadlines: [{ month: 10, day: 31, label: { en: 'National Scholarship Portal — usual fresh-application window', hi: 'नेशनल स्कॉलरशिप पोर्टल — आमतौर पर नए आवेदन की अंतिम तिथि' } }],
    name: { en: 'PM YASASVI scholarship (OBC / EBC / DNT)', hi: 'पीएम यशस्वी छात्रवृत्ति (ओबीसी / ईबीसी / डीएनटी)' },
    short: { en: 'Scholarships for OBC, EBC and denotified-tribe students.', hi: 'ओबीसी, ईबीसी और विमुक्त जनजाति छात्रों के लिए छात्रवृत्ति।' },
    benefit: { en: 'Yearly scholarship and fee support for school and college education.', hi: 'स्कूल और कॉलेज की पढ़ाई के लिए वार्षिक छात्रवृत्ति और फीस सहायता।' },
    ministry: 'Ministry of Social Justice & Empowerment', portal: 'https://scholarships.gov.in',
    docs: ['aadhaar', 'caste_cert', 'income_cert', 'student_proof', 'bank_passbook', 'photo'],
    rule: { occupations: ['student'], categories: ['obc'], maxIncome: 250_000 },
    incomeBasis: 'official',
    tags: ['scholarship', 'obc', 'yasasvi', 'backward', 'student', 'छात्रवृत्ति', 'पिछड़ा', 'यशस्वी', 'nsp'],
  },
  {
    id: 'csss', category: 'education',
    deadlines: [{ month: 10, day: 31, label: { en: 'National Scholarship Portal — usual fresh-application window', hi: 'नेशनल स्कॉलरशिप पोर्टल — आमतौर पर नए आवेदन की अंतिम तिथि' } }],
    name: { en: 'Central Sector Scholarship (college & university)', hi: 'केंद्रीय क्षेत्र छात्रवृत्ति (कॉलेज और विश्वविद्यालय)' },
    short: { en: 'Merit-cum-means scholarship for college students from modest families.', hi: 'सीमित आय वाले परिवारों के कॉलेज छात्रों के लिए मेरिट-कम-मीन्स छात्रवृत्ति।' },
    benefit: { en: 'About ₹12,000 a year for graduation (₹20,000 a year in the final years of PG / integrated courses).', hi: 'स्नातक के लिए लगभग ₹12,000 प्रति वर्ष (पीजी / एकीकृत पाठ्यक्रम के अंतिम वर्षों में ₹20,000)।' },
    ministry: 'Ministry of Education', portal: 'https://scholarships.gov.in',
    docs: ['aadhaar', 'income_cert', 'student_proof', 'bank_passbook', 'photo'],
    rule: { occupations: ['student'], maxIncome: 450_000, age: { min: 17 } },
    incomeBasis: 'official',
    questions: [{ id: 'merit_80', text: { en: 'Did you score above the 80th percentile in Class 12 in your board?', hi: 'क्या आपने अपने बोर्ड में कक्षा 12 में 80वें पर्सेंटाइल से अधिक अंक पाए?' }, need: 'yes' }],
    tags: ['scholarship', 'college', 'university', 'merit', 'graduation', 'student', 'छात्रवृत्ति', 'कॉलेज', 'मेरिट', 'nsp', 'csss'],
  },
  {
    id: 'mgnrega', category: 'employment',
    name: { en: 'MGNREGA (rural wage employment)', hi: 'मनरेगा (ग्रामीण मज़दूरी रोज़गार)' },
    short: { en: 'Guaranteed paid work for rural households willing to do unskilled manual labour.', hi: 'अकुशल शारीरिक श्रम करने को तैयार ग्रामीण परिवारों के लिए गारंटीशुदा रोज़गार।' },
    benefit: { en: 'At least 100 days of wage employment a year per household at the notified state wage, paid into your bank account.', hi: 'प्रति परिवार साल में कम से कम 100 दिन का मज़दूरी रोज़गार, राज्य की अधिसूचित दर पर, बैंक खाते में भुगतान।' },
    ministry: 'Ministry of Rural Development', portal: 'https://nrega.nic.in',
    docs: ['aadhaar', 'photo', 'bank_passbook', 'residence'],
    rule: { area: 'rural', age: { min: 18 }, excludeOccupations: ['govt_job'] },
    tags: ['nrega', 'mgnrega', 'manrega', 'job card', 'work', 'wage', 'labour', 'rural employment', 'मनरेगा', 'रोज़गार', 'मज़दूरी', 'काम', 'जॉब कार्ड'],
  },
  {
    id: 'pm-sym', category: 'pension_insurance',
    name: { en: 'PM Shram Yogi Maandhan', hi: 'पीएम श्रम योगी मानधन' },
    short: { en: 'Pension for unorganised-sector workers earning up to ₹15,000 a month.', hi: '₹15,000 मासिक तक कमाने वाले असंगठित क्षेत्र के कामगारों के लिए पेंशन।' },
    benefit: { en: '₹3,000 a month pension after 60; you pay ₹55–200 a month and the government matches it.', hi: '60 वर्ष के बाद ₹3,000 मासिक पेंशन; आप ₹55–200 मासिक देते हैं और सरकार उतना ही जमा करती है।' },
    ministry: 'Ministry of Labour & Employment', portal: 'https://maandhan.in',
    docs: ['aadhaar', 'bank_passbook'],
    rule: { occupations: NON_AGRI_UNORGANISED, age: { min: 18, max: 40 }, maxIncome: 180_000 },
    incomeBasis: 'official',
    questions: [Q.epfo, Q.incomeTax],
    tags: ['pension', 'shram yogi', 'maandhan', 'labour', 'worker', 'unorganised', 'श्रम योगी', 'मजदूर', 'पेंशन'],
  },
  {
    id: 'eshram', category: 'employment',
    trending: true,
    name: { en: 'e-Shram card', hi: 'ई-श्रम कार्ड' },
    short: { en: 'National registration and benefits for unorganised workers.', hi: 'असंगठित कामगारों का राष्ट्रीय पंजीकरण और लाभ।' },
    benefit: { en: 'e-Shram ID, ₹2 lakh accidental-death / disability insurance and easier access to other labour schemes.', hi: 'ई-श्रम आईडी, ₹2 लाख का दुर्घटना मृत्यु / विकलांगता बीमा और अन्य श्रम योजनाओं तक आसान पहुँच।' },
    ministry: 'Ministry of Labour & Employment', portal: 'https://eshram.gov.in',
    docs: ['aadhaar', 'bank_passbook'],
    rule: { occupations: NON_AGRI_UNORGANISED, age: { min: 16, max: 59 } },
    questions: [Q.epfo, Q.incomeTax],
    tags: ['eshram', 'e-shram', 'labour card', 'worker', 'unorganised', 'मजदूर', 'ई-श्रम', 'श्रमिक', 'labour'],
  },
  {
    id: 'pmjdy', category: 'pension_insurance',
    name: { en: 'PM Jan Dhan Yojana', hi: 'प्रधानमंत्री जन धन योजना' },
    short: { en: 'A zero-balance bank account for every person without one.', hi: 'बैंक खाता न रखने वाले हर व्यक्ति के लिए ज़ीरो-बैलेंस खाता।' },
    benefit: { en: 'Zero-balance account, RuPay debit card with ₹2 lakh accident cover and an overdraft facility of up to ₹10,000.', hi: 'ज़ीरो-बैलेंस खाता, ₹2 लाख दुर्घटना कवर वाला रुपे डेबिट कार्ड और ₹10,000 तक की ओवरड्राफ्ट सुविधा।' },
    ministry: 'Department of Financial Services', portal: 'https://pmjdy.gov.in',
    docs: ['aadhaar', 'photo'],
    rule: { age: { min: 10 } },
    questions: [{ id: 'no_account', text: { en: 'Do you NOT have a bank account yet?', hi: 'क्या आपका अभी तक कोई बैंक खाता नहीं है?' }, need: 'yes' }],
    tags: ['jan dhan', 'bank account', 'zero balance', 'account', 'जन धन', 'बैंक खाता', 'खाता', 'rupay'],
  },
  {
    id: 'pm-surya-ghar', category: 'housing',
    trending: true,
    name: { en: 'PM Surya Ghar (rooftop solar)', hi: 'पीएम सूर्य घर (रूफ़टॉप सोलर)' },
    short: { en: 'Subsidy for putting solar panels on your own roof.', hi: 'अपनी छत पर सोलर पैनल लगाने के लिए सब्सिडी।' },
    benefit: { en: 'Subsidy of ₹30,000 per kW up to 2 kW and ₹18,000 for the 3rd kW (maximum ₹78,000), plus up to 300 free units a month.', hi: '2 किलोवाट तक ₹30,000 प्रति किलोवाट और तीसरे किलोवाट पर ₹18,000 (अधिकतम ₹78,000), साथ में प्रति माह 300 यूनिट तक मुफ़्त बिजली।' },
    ministry: 'Ministry of New & Renewable Energy', portal: 'https://pmsuryaghar.gov.in',
    docs: ['aadhaar', 'electricity_bill', 'bank_passbook'],
    rule: { age: { min: 18 } },
    questions: [
      { id: 'own_roof', text: { en: 'Do you own the house and a roof suitable for solar panels?', hi: 'क्या आप घर के मालिक हैं और छत सोलर पैनल के लिए उपयुक्त है?' }, need: 'yes' },
      { id: 'has_connection', text: { en: 'Do you have a valid electricity connection, and have you not taken a solar subsidy before?', hi: 'क्या आपके पास वैध बिजली कनेक्शन है और आपने पहले सोलर सब्सिडी नहीं ली है?' }, need: 'yes' },
    ],
    tags: ['solar', 'rooftop', 'electricity', 'bijli', 'surya ghar', 'free electricity', 'सोलर', 'सूर्य घर', 'बिजली', 'सौर'],
  },
  {
    id: 'pmkvy', category: 'employment',
    name: { en: 'PM Kaushal Vikas Yojana (free skill training)', hi: 'प्रधानमंत्री कौशल विकास योजना (मुफ़्त कौशल प्रशिक्षण)' },
    short: { en: 'Short-term skill courses with a government-recognised certificate.', hi: 'सरकार-मान्य प्रमाणपत्र के साथ अल्पकालिक कौशल पाठ्यक्रम।' },
    benefit: { en: 'Free industry-relevant training, a certificate and placement assistance.', hi: 'उद्योग-उपयोगी मुफ़्त प्रशिक्षण, प्रमाणपत्र और नौकरी में सहायता।' },
    ministry: 'Ministry of Skill Development & Entrepreneurship', portal: 'https://www.skillindiadigital.gov.in',
    docs: ['aadhaar', 'age_proof', 'bank_passbook', 'photo'],
    rule: { age: { min: 15, max: 45 }, occupations: ['unemployed', 'daily_wage', 'farm_labourer', 'homemaker', 'student', 'other'] },
    tags: ['skill', 'training', 'course', 'job', 'kaushal', 'pmkvy', 'certificate', 'कौशल', 'प्रशिक्षण', 'नौकरी', 'रोज़गार', 'ट्रेनिंग'],
  },
];

export const SCHEME_BY_ID: Record<string, Scheme> = Object.fromEntries(SCHEMES.map((s) => [s.id, s]));
export const isSchemeId = (v: unknown): v is string => typeof v === 'string' && v in SCHEME_BY_ID;
export const schemesIn = (c: SchemeCategory): Scheme[] => SCHEMES.filter((s) => s.category === c);

/** Rank schemes against what a citizen typed (English, Hindi or Hinglish). Used offline and as the AI's shortlist. */
export function searchSchemes(query: string, limit = 5): Scheme[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  const words = q.split(/[\s,.;:!?/]+/).filter((w) => w.length >= 2);
  const scored = SCHEMES.map((s) => {
    let score = 0;
    const name = `${s.name.en} ${s.name.hi}`.toLowerCase();
    if (name.includes(q)) score += 10;
    for (const w of words) {
      if (name.includes(w)) score += 3;
      for (const t of s.tags) {
        const tl = t.toLowerCase();
        if (q.includes(tl)) score += tl.length >= 4 ? 4 : 2;
        else if (tl.includes(w) && w.length >= 3) score += 1;
      }
      if (s.short.en.toLowerCase().includes(w) || s.short.hi.includes(w)) score += 1;
    }
    return { s, score };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.s);
}
