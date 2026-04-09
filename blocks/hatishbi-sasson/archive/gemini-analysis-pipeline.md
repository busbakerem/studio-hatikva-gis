# מנגנון ניתוח מסמכי ארכיון הנדסי — Gemini API Pipeline

## 1. סקירת מצב

### מה יש

- **3,353 מסמכים** מ-4 חלקות מושע (6135/43, 6135/44, 6135/71, 6135/110)
- **101 תיקי בניין** על 7 רחובות (תשבי, ששון, אביטל, וילון, אצ"ל, תרדיון, לח"י)
- **47 סוגי מסמכים** — מהיתרים חתומים ועד מכתבים
- **4 קבצי אינדקס JSON** עם metadata בסיסי (folderId, title, date, downloadUrl)

### מה חסר

המסמכים עצמם לא נותחו — אנחנו יודעים שיש "היתר מילולי חתום" אבל לא יודעים:

- כמה קומות אושרו
- מה השטח
- מה השימוש
- מי הבעלים
- מה התנאים

---

## 2. ארכיטקטורת הניתוח

### שלוש קטגוריות ניתוח

לא כל מסמך דורש אותו ניתוח. מחלקים ל-3 קטגוריות:

#### קטגוריה A — ניתוח מעמיק (core documents)

~600 מסמכים, פרומפט מפורט, JSON עשיר

| סוג                     | כמות | מה לחלץ                               |
| ----------------------- | ---- | ------------------------------------- |
| היתר מילולי חתום        | 66   | קומות, שטח, יח"ד, שימוש, תנאים, תאריך |
| היתר-תכנית חתומה        | 54   | תוכנית אדריכלית, מידות, קווי בניין    |
| בקשה                    | 103  | מה מבוקש, שטח, קומות, סטטוס           |
| החלטת ועדה              | 63   | אושר/נדחה, תנאים, הערות               |
| מפות מדידה              | 95   | גבולות, שטחים, מבנים קיימים           |
| מפת מדידה להיתר         | 22   | גבולות מגרש, קווי בניין               |
| תכנית מתוקנת (אדריכלות) | 21   | שינויים מהמקור                        |
| תכנית הבקשה להיתר       | 18   | תוכנית אדריכלית מלאה                  |
| חישוב שטחים             | 20   | שטחים מפורטים                         |
| תיק מידע                | 182  | זכויות, תב"ע חלה, הגבלות              |

#### קטגוריה B — ניתוח בינוני (supporting documents)

~800 מסמכים, פרומפט ממוקד, JSON קצר

| סוג               | כמות | מה לחלץ                  |
| ----------------- | ---- | ------------------------ |
| תיק מבנים מסוכנים | 322  | מצב, סיכון, המלצה, תאריך |
| ועדת ערר/משנה     | 221  | החלטה, נושא, תנאים       |
| רישוי עסקים       | 98   | סוג עסק, כתובת, סטטוס    |
| טופס 1 / טופס 4   | 39   | סטטוס בנייה, תאריך       |
| תעודת גמר         | 18   | אישור סיום, תאריך        |
| תוכנית סניטרית    | 44   | תשתיות                   |

#### קטגוריה C — סריקה מהירה (metadata only)

~1,900 מסמכים, פרומפט מינימלי, 3 שדות בלבד

| סוג              | כמות | מה לחלץ               |
| ---------------- | ---- | --------------------- |
| מכתב נכנס/יוצא   | 404  | תאריך, נושא, שורה אחת |
| הודעת שומה/אגרות | 296  | סכום, תאריך           |
| נסח טאבו         | 278  | בעלים, שטח, זכויות    |
| מכתבים/תכתובת    | 270  | תאריך, נושא           |
| אישורי תחנות     | 142  | סוג, תאריך            |
| רישוי-אחר        | 167  | סוג, תאריך            |

---

## 3. JSON Schema לכל קטגוריה

### קטגוריה A — Full Analysis

```json
{
  "fileName": "string",
  "category": "A",
  "documentType": "היתר/בקשה/החלטה/מדידה/תוכנית/מידע",
  "date": "DD/MM/YYYY",
  "addresses": ["תשבי 5", "ששון 12"],
  "gush": "6135",
  "chelkot": ["43", "44"],
  "permitNumber": "string or null",

  "building": {
    "floors": "number or null",
    "units": "number or null",
    "area_sqm": "number or null",
    "roofArea_sqm": "number or null",
    "use": "מגורים/מסחר/מעורב/ציבורי/null",
    "buildingLines": "string description or null",
    "height_m": "number or null",
    "parking": "number or null"
  },

  "planning": {
    "tabaRef": "תא/2215 or null",
    "zoning": "string or null",
    "buildingRights_pct": "number or null",
    "conditions": ["תנאי 1", "תנאי 2"],
    "decision": "אושר/נדחה/בתנאים/null"
  },

  "ownership": {
    "owner": "string or null",
    "applicant": "string or null",
    "architect": "string or null"
  },

  "condition": {
    "status": "תקין/מסוכן/להריסה/בבנייה/null",
    "dangerLevel": "string or null",
    "notes": "string or null"
  },

  "description": "תיאור קצר בעברית",
  "keyFindings": ["ממצא 1", "ממצא 2", "ממצא 3"],
  "isReadable": true,
  "confidence": "high/medium/low"
}
```

### קטגוריה B — Focused Analysis

```json
{
  "fileName": "string",
  "category": "B",
  "documentType": "string",
  "date": "DD/MM/YYYY",
  "addresses": ["string"],
  "gush": "6135",
  "chelkot": ["string"],

  "summary": {
    "status": "string — מצב/החלטה/סוג עסק",
    "decision": "אושר/נדחה/null",
    "details": "string — פרטים עיקריים"
  },

  "description": "שורה אחת בעברית",
  "isReadable": true,
  "confidence": "high/medium/low"
}
```

### קטגוריה C — Quick Scan

```json
{
  "fileName": "string",
  "category": "C",
  "documentType": "string",
  "date": "DD/MM/YYYY",
  "oneLiner": "שורה אחת — מה המסמך",
  "isReadable": true
}
```

---

## 4. פרומפטים

### פרומפט A — Full Analysis

````
אתה מנתח מסמכי ארכיון הנדסי של עיריית תל אביב.
הבלוק: תשבי-ששון, שכונת התקווה.
גוש 6135, חלקות 43/44/71/110.
רחובות: תשבי, ששון, אביטל, וילון, אצ"ל, תרדיון, לח"י.

המסמך הזה הוא [TYPE]. נתח אותו וחלץ את כל המידע הבא.
החזר JSON בלבד — בלי markdown, בלי הסברים, בלי ```json```.

[SCHEMA A]

כללים:
- אם שדה לא רלוונטי או לא מופיע — null
- תאריכים בפורמט DD/MM/YYYY
- שטחים במ"ר
- אם המסמך לא קריא — isReadable: false, ומלא מה שאפשר
- confidence: high אם ברור, medium אם חלקי, low אם מנחש
````

### פרומפט B — Focused Analysis

```
מסמך ארכיון הנדסי, בלוק תשבי-ששון, גוש 6135.
סוג: [TYPE]. חלץ JSON בלבד:

[SCHEMA B]
```

### פרומפט C — Quick Scan

```
מסמך ארכיון הנדסי. חלץ JSON בלבד:

[SCHEMA C]
```

---

## 5. Pipeline טכני

### Input

```
Downloads/           ← PDFs שירדו
archive-6135_*.json  ← אינדקסים עם metadata
```

### Processing (Python + Gemini API)

```python
# 1. מיפוי: fileName → folderId → street/house → category
# 2. לכל PDF:
#    a. סיווג קטגוריה (A/B/C) לפי title מהאינדקס
#    b. בחירת פרומפט מתאים
#    c. Upload ל-Gemini File API
#    d. שליחה עם פרומפט
#    e. פרסור JSON
#    f. שמירה incremental
# 3. Rate limiting: 10/min, retry on 429
# 4. שמירה אחרי כל 10 קבצים
# 5. Resume: דילוג על קבצים שכבר נותחו
```

### Output

```
analysis/
├── gemini-results-A.json    ← ~600 full analyses
├── gemini-results-B.json    ← ~800 focused analyses
├── gemini-results-C.json    ← ~1900 quick scans
├── gemini-errors.json       ← failures for retry
├── gemini-summary.md        ← human-readable summary
└── block-database-enriched.json  ← merged master database
```

---

## 6. עלויות וזמנים

### Gemini API Free Tier

- 15 requests/minute, 1,500/day
- 3,353 מסמכים ÷ 1,500/day = **~2.5 ימים**
- או: 3,353 ÷ 15/min = **~3.7 שעות** (אם רץ רצוף)

### אסטרטגיה

- יום 1: קטגוריה A (600 docs, ~40 min)
- יום 1: קטגוריה B (800 docs, ~55 min)
- יום 2: קטגוריה C (1,900 docs, ~2 hours)

### Claude Code

- סשן 1: בניית pipeline + test על 10 קבצים
- סשן 2: הרצת A+B
- סשן 3: הרצת C + מיזוג + dashboard

---

## 7. Output — מה נקבל בסוף

### block-database-enriched.json

מאגר מאוחד עם:

- כל מבנה → כתובת, חלקה, קומות, שטח, שימוש, מצב
- כל היתר → מה אושר, מתי, תנאים
- כל עסק → סוג, כתובת, סטטוס
- כל מבנה מסוכן → רמת סיכון, המלצה
- ציר זמן → כל פעילות לפי תאריך

### Dashboard (HTML)

- מפת הבלוק עם שכבות צבעוניות
- ציר זמן של פעילות בנייה (1900-2025)
- חלוקה לפי סוג מסמך
- מצב מבנים (תקין/מסוכן/להריסה)
- שימושים (מגורים/מסחר/מעורב)
- סטטיסטיקות: שטחים, קומות, יח"ד

### block-map.html (עדכון)

- לחיצה על מבנה → כל המסמכים שלו
- סינון לפי סוג/שנה/מצב
- קישורים ל-PDFs
