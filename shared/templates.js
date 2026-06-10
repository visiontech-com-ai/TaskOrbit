// Workflow template definitions for the Templates Gallery.
// Each template includes a full workflow object that can be cloned and used directly.

export const TEMPLATE_CATEGORIES = [
  { id: "productivity", label: "🏢 Productivity" },
  { id: "data-entry",   label: "📊 Data Entry" },
  { id: "scraping",     label: "🕷️ Scraping" },
  { id: "utility",      label: "🔁 Utility" },
  { id: "qa-testing",   label: "🧪 QA/Testing" }
];

export const TEMPLATES = [
  // ── Productivity ──────────────────────────────────────────────────────────
  {
    id: "tpl_auto_login",
    name: "Auto Login",
    description: "Automatically fills in username and password fields and submits the login form. Uses variables so credentials stay editable.",
    category: "productivity",
    icon: "🔐",
    workflow: {
      id: "template_auto_login",
      name: "Auto Login",
      sites: [],
      steps: [
        { type: "waitFor", selectorType: "css", selector: "input[type='email'], input[name='username'], #username", value: "", delayMs: 5000, optional: false },
        { type: "clearField", selectorType: "css", selector: "input[type='email'], input[name='username'], #username", value: "", delayMs: 0, optional: false },
        { type: "setText", selectorType: "css", selector: "input[type='email'], input[name='username'], #username", value: "{{username}}", delayMs: 300, optional: false },
        { type: "clearField", selectorType: "css", selector: "input[type='password'], input[name='password'], #password", value: "", delayMs: 0, optional: false },
        { type: "setText", selectorType: "css", selector: "input[type='password'], input[name='password'], #password", value: "{{password}}", delayMs: 300, optional: false },
        { type: "click", selectorType: "css", selector: "button[type='submit'], input[type='submit'], .login-btn", value: "", delayMs: 500, optional: false }
      ],
      variables: [
        { name: "username", defaultValue: "" },
        { name: "password", defaultValue: "" }
      ],
      autoRun: false,
      folder: "Templates",
      maxRetries: 3
    }
  },
  {
    id: "tpl_cookie_consent",
    name: "Accept Cookie Consent",
    description: "Dismisses common cookie consent banners by clicking typical accept/agree buttons. Tries multiple selectors for broad compatibility.",
    category: "productivity",
    icon: "🍪",
    workflow: {
      id: "template_cookie_consent",
      name: "Accept Cookie Consent",
      sites: [],
      steps: [
        { type: "wait", selectorType: "css", selector: "", value: "", delayMs: 1500, optional: false },
        { type: "click", selectorType: "css", selector: "[id*='cookie'] button, [class*='cookie'] button, [id*='consent'] button, [class*='consent'] button", value: "", delayMs: 0, optional: true },
        { type: "click", selectorType: "text", selector: "Accept All", value: "", delayMs: 0, optional: true },
        { type: "click", selectorType: "text", selector: "Accept", value: "", delayMs: 0, optional: true },
        { type: "click", selectorType: "text", selector: "I Agree", value: "", delayMs: 0, optional: true },
        { type: "click", selectorType: "text", selector: "Got it", value: "", delayMs: 0, optional: true }
      ],
      variables: [],
      autoRun: false,
      folder: "Templates",
      maxRetries: 1
    }
  },
  {
    id: "tpl_dismiss_popups",
    name: "Dismiss Popups & Overlays",
    description: "Closes newsletter modals, promo popups, and chat widgets that commonly appear on websites.",
    category: "productivity",
    icon: "🚫",
    workflow: {
      id: "template_dismiss_popups",
      name: "Dismiss Popups & Overlays",
      sites: [],
      steps: [
        { type: "wait", selectorType: "css", selector: "", value: "", delayMs: 2000, optional: false },
        { type: "click", selectorType: "css", selector: ".modal .close, .modal-close, [aria-label='Close'], [data-dismiss='modal']", value: "", delayMs: 0, optional: true },
        { type: "click", selectorType: "css", selector: ".popup-close, .overlay-close, .newsletter-close", value: "", delayMs: 0, optional: true },
        { type: "click", selectorType: "css", selector: "#intercom-close, .intercom-close, [aria-label='Close chat']", value: "", delayMs: 0, optional: true },
        { type: "pressKey", selectorType: "css", selector: "body", value: "{\"key\":\"Escape\",\"ctrl\":false,\"alt\":false,\"shift\":false,\"meta\":false}", delayMs: 500, optional: true }
      ],
      variables: [],
      autoRun: false,
      folder: "Templates",
      maxRetries: 1
    }
  },

  // ── Data Entry ────────────────────────────────────────────────────────────
  {
    id: "tpl_form_fill_csv",
    name: "Form Fill from CSV",
    description: "Loads CSV data and loops through each row to fill out a form, submit it, and move to the next entry. Great for bulk registrations or data entry.",
    category: "data-entry",
    icon: "📝",
    workflow: {
      id: "template_form_fill_csv",
      name: "Form Fill from CSV",
      sites: [],
      steps: [
        { type: "load_csv", selectorType: "css", selector: "", value: "name,email,phone\nJohn Doe,john@example.com,555-0100\nJane Smith,jane@example.com,555-0200", delayMs: 0, optional: false },
        {
          type: "loop", selectorType: "css", selector: "", value: "", delayMs: 0, optional: false,
          mode: "forEachRow", count: 5,
          steps: [
            { type: "clearField", selectorType: "css", selector: "input[name='name'], #name", value: "", delayMs: 0, optional: false },
            { type: "setText", selectorType: "css", selector: "input[name='name'], #name", value: "{{name}}", delayMs: 200, optional: false },
            { type: "clearField", selectorType: "css", selector: "input[name='email'], #email, input[type='email']", value: "", delayMs: 0, optional: false },
            { type: "setText", selectorType: "css", selector: "input[name='email'], #email, input[type='email']", value: "{{email}}", delayMs: 200, optional: false },
            { type: "clearField", selectorType: "css", selector: "input[name='phone'], #phone, input[type='tel']", value: "", delayMs: 0, optional: false },
            { type: "setText", selectorType: "css", selector: "input[name='phone'], #phone, input[type='tel']", value: "{{phone}}", delayMs: 200, optional: false },
            { type: "click", selectorType: "css", selector: "button[type='submit'], input[type='submit']", value: "", delayMs: 1000, optional: false },
            { type: "mark_row_processed", selectorType: "css", selector: "", value: "", delayMs: 0, optional: false },
            { type: "wait", selectorType: "css", selector: "", value: "", delayMs: 1500, optional: false }
          ]
        }
      ],
      variables: [],
      autoRun: false,
      folder: "Templates",
      maxRetries: 3
    }
  },
  {
    id: "tpl_bulk_field_update",
    name: "Bulk Field Update",
    description: "Navigates to a list page, clicks each row's edit button, updates a specific field value, saves, and returns. Useful for CRMs, admin panels, etc.",
    category: "data-entry",
    icon: "✏️",
    workflow: {
      id: "template_bulk_field_update",
      name: "Bulk Field Update",
      sites: [],
      steps: [
        { type: "waitFor", selectorType: "css", selector: "table tbody tr, .list-item, .data-row", value: "", delayMs: 5000, optional: false },
        {
          type: "loop", selectorType: "css", selector: "table tbody tr, .list-item, .data-row", value: "", delayMs: 0, optional: false,
          mode: "forEach", count: 5,
          steps: [
            { type: "click", selectorType: "css", selector: ".edit-btn, [aria-label='Edit'], a[href*='edit']", value: "", delayMs: 500, optional: false },
            { type: "waitFor", selectorType: "css", selector: "input[name='{{fieldName}}'], #{{fieldName}}", value: "", delayMs: 3000, optional: false },
            { type: "clearField", selectorType: "css", selector: "input[name='{{fieldName}}'], #{{fieldName}}", value: "", delayMs: 0, optional: false },
            { type: "setText", selectorType: "css", selector: "input[name='{{fieldName}}'], #{{fieldName}}", value: "{{newValue}}", delayMs: 200, optional: false },
            { type: "click", selectorType: "css", selector: "button[type='submit'], .save-btn, [aria-label='Save']", value: "", delayMs: 1000, optional: false },
            { type: "wait", selectorType: "css", selector: "", value: "", delayMs: 1000, optional: false }
          ]
        }
      ],
      variables: [
        { name: "fieldName", defaultValue: "status" },
        { name: "newValue", defaultValue: "Active" }
      ],
      autoRun: false,
      folder: "Templates",
      maxRetries: 3
    }
  },

  // ── Scraping ──────────────────────────────────────────────────────────────
  {
    id: "tpl_extract_table",
    name: "Extract HTML Table",
    description: "Extracts data from an HTML table row by row, saving each cell's text to variables, then exports the collected data as CSV.",
    category: "scraping",
    icon: "📊",
    workflow: {
      id: "template_extract_table",
      name: "Extract HTML Table",
      sites: [],
      steps: [
        { type: "waitFor", selectorType: "css", selector: "table tbody tr", value: "", delayMs: 5000, optional: false },
        {
          type: "loop", selectorType: "css", selector: "table tbody tr", value: "", delayMs: 0, optional: false,
          mode: "forEach", count: 5,
          steps: [
            { type: "extractText", selectorType: "css", selector: "td:nth-child(1)", value: "col1", delayMs: 0, optional: true, parseNumeric: false },
            { type: "extractText", selectorType: "css", selector: "td:nth-child(2)", value: "col2", delayMs: 0, optional: true, parseNumeric: false },
            { type: "extractText", selectorType: "css", selector: "td:nth-child(3)", value: "col3", delayMs: 0, optional: true, parseNumeric: false },
            { type: "append_row", selectorType: "css", selector: "", value: "col1, col2, col3", delayMs: 0, optional: false }
          ]
        },
        { type: "export_table", selectorType: "css", selector: "", value: "extracted_table.csv", delayMs: 0, optional: false }
      ],
      variables: [],
      autoRun: false,
      folder: "Templates",
      maxRetries: 3
    }
  },
  {
    id: "tpl_price_tracker",
    name: "Price Tracker",
    description: "Navigates to a product page, extracts the product name and current price, and saves a timestamped row. Run on a schedule to track price changes over time.",
    category: "scraping",
    icon: "💰",
    workflow: {
      id: "template_price_tracker",
      name: "Price Tracker",
      sites: [],
      steps: [
        { type: "navigate", selectorType: "css", selector: "", value: "{{productUrl}}", delayMs: 0, optional: false },
        { type: "waitFor", selectorType: "css", selector: "{{priceSelector}}", value: "", delayMs: 8000, optional: false },
        { type: "extractText", selectorType: "css", selector: "{{titleSelector}}", value: "productTitle", delayMs: 0, optional: false, parseNumeric: false },
        { type: "extractText", selectorType: "css", selector: "{{priceSelector}}", value: "currentPrice", delayMs: 0, optional: false, parseNumeric: true },
        { type: "append_row", selectorType: "css", selector: "{{productUrl}}", value: "productTitle, currentPrice", delayMs: 0, optional: false },
        { type: "export_table", selectorType: "css", selector: "", value: "price_history.csv", delayMs: 0, optional: false }
      ],
      variables: [
        { name: "productUrl", defaultValue: "https://example.com/product" },
        { name: "titleSelector", defaultValue: "h1, .product-title" },
        { name: "priceSelector", defaultValue: ".price, .product-price, [data-price]" }
      ],
      autoRun: false,
      folder: "Templates",
      maxRetries: 3
    }
  },
  {
    id: "tpl_scrape_links",
    name: "Scrape All Links",
    description: "Extracts all links from a page matching a CSS pattern, saves the text and href to a table, and exports as CSV. Useful for link audits or content inventories.",
    category: "scraping",
    icon: "🔗",
    workflow: {
      id: "template_scrape_links",
      name: "Scrape All Links",
      sites: [],
      steps: [
        { type: "waitFor", selectorType: "css", selector: "{{linkSelector}}", value: "", delayMs: 5000, optional: false },
        {
          type: "loop", selectorType: "css", selector: "{{linkSelector}}", value: "", delayMs: 0, optional: false,
          mode: "forEach", count: 5,
          steps: [
            { type: "extractText", selectorType: "css", selector: "", value: "linkText", delayMs: 0, optional: true, parseNumeric: false },
            { type: "append_row", selectorType: "css", selector: "", value: "linkText", delayMs: 0, optional: false }
          ]
        },
        { type: "export_table", selectorType: "css", selector: "", value: "scraped_links.csv", delayMs: 0, optional: false }
      ],
      variables: [
        { name: "linkSelector", defaultValue: "a[href]" }
      ],
      autoRun: false,
      folder: "Templates",
      maxRetries: 3
    }
  },

  // ── Utility ───────────────────────────────────────────────────────────────
  {
    id: "tpl_pagination_clickthrough",
    name: "Pagination Click-Through",
    description: "Clicks a 'Next' button repeatedly to navigate through paginated content, waiting for the page to load between clicks.",
    category: "utility",
    icon: "📄",
    workflow: {
      id: "template_pagination_clickthrough",
      name: "Pagination Click-Through",
      sites: [],
      steps: [
        { type: "waitFor", selectorType: "css", selector: "{{nextBtnSelector}}", value: "", delayMs: 5000, optional: false },
        {
          type: "loop", selectorType: "css", selector: "{{nextBtnSelector}}", value: "", delayMs: 0, optional: false,
          mode: "whileExists", count: 5,
          steps: [
            { type: "click", selectorType: "css", selector: "{{nextBtnSelector}}", value: "", delayMs: 0, optional: false },
            { type: "wait", selectorType: "css", selector: "", value: "", delayMs: 2000, optional: false },
            { type: "waitFor", selectorType: "css", selector: "{{contentSelector}}", value: "", delayMs: 5000, optional: true },
            { type: "screenshot", selectorType: "css", selector: "", value: "page_{{_index}}", delayMs: 500, optional: true }
          ]
        }
      ],
      variables: [
        { name: "nextBtnSelector", defaultValue: "a.next, button.next, [aria-label='Next'], .pagination .next" },
        { name: "contentSelector", defaultValue: ".results, .content, main" }
      ],
      autoRun: false,
      folder: "Templates",
      maxRetries: 3
    }
  },
  {
    id: "tpl_clear_notifications",
    name: "Clear All Notifications",
    description: "Opens the notification panel and clicks dismiss/clear buttons for all visible notifications. Repeats until no more remain.",
    category: "utility",
    icon: "🔔",
    workflow: {
      id: "template_clear_notifications",
      name: "Clear All Notifications",
      sites: [],
      steps: [
        { type: "click", selectorType: "css", selector: ".notification-bell, [aria-label='Notifications'], .notifications-icon", value: "", delayMs: 1000, optional: false },
        { type: "waitFor", selectorType: "css", selector: ".notification-list, .notifications-panel, [role='menu']", value: "", delayMs: 3000, optional: false },
        { type: "click", selectorType: "css", selector: ".mark-all-read, [aria-label='Mark all as read']", value: "", delayMs: 500, optional: true },
        {
          type: "loop", selectorType: "css", selector: ".notification .dismiss, .notification .close, .notification-item .btn-close", value: "", delayMs: 0, optional: false,
          mode: "whileExists", count: 5,
          steps: [
            { type: "click", selectorType: "css", selector: ".notification .dismiss, .notification .close, .notification-item .btn-close", value: "", delayMs: 0, optional: true },
            { type: "wait", selectorType: "css", selector: "", value: "", delayMs: 500, optional: false }
          ]
        }
      ],
      variables: [],
      autoRun: false,
      folder: "Templates",
      maxRetries: 2
    }
  },

  // ── QA / Testing ──────────────────────────────────────────────────────────
  {
    id: "tpl_smoke_test",
    name: "Smoke Test – Page Load Check",
    description: "Navigates to a URL, waits for key elements to appear, takes a screenshot, and verifies the page title. A quick health check for any web page.",
    category: "qa-testing",
    icon: "🔥",
    workflow: {
      id: "template_smoke_test",
      name: "Smoke Test – Page Load Check",
      sites: [],
      steps: [
        { type: "navigate", selectorType: "css", selector: "", value: "{{testUrl}}", delayMs: 0, optional: false },
        { type: "waitFor", selectorType: "css", selector: "body", value: "", delayMs: 10000, optional: false },
        { type: "waitVisible", selectorType: "css", selector: "{{heroSelector}}", value: "", delayMs: 5000, optional: true },
        { type: "waitFor", selectorType: "css", selector: "{{navSelector}}", value: "", delayMs: 5000, optional: true },
        { type: "screenshot", selectorType: "css", selector: "", value: "smoke_test_{{testUrl}}", delayMs: 500, optional: false },
        { type: "extractText", selectorType: "css", selector: "title", value: "pageTitle", delayMs: 0, optional: true, parseNumeric: false }
      ],
      variables: [
        { name: "testUrl", defaultValue: "https://example.com" },
        { name: "heroSelector", defaultValue: "h1, .hero, [role='banner']" },
        { name: "navSelector", defaultValue: "nav, .navbar, [role='navigation']" }
      ],
      autoRun: false,
      folder: "Templates",
      maxRetries: 2
    }
  },
  {
    id: "tpl_form_validation_test",
    name: "Form Validation Test",
    description: "Submits a form with empty fields to trigger validation errors, then checks that error messages are displayed. Verifies client-side validation works correctly.",
    category: "qa-testing",
    icon: "✅",
    workflow: {
      id: "template_form_validation_test",
      name: "Form Validation Test",
      sites: [],
      steps: [
        { type: "navigate", selectorType: "css", selector: "", value: "{{formUrl}}", delayMs: 0, optional: false },
        { type: "waitFor", selectorType: "css", selector: "form", value: "", delayMs: 5000, optional: false },
        { type: "clearField", selectorType: "css", selector: "input[required]:first-of-type", value: "", delayMs: 200, optional: true },
        { type: "click", selectorType: "css", selector: "button[type='submit'], input[type='submit']", value: "", delayMs: 500, optional: false },
        { type: "screenshot", selectorType: "css", selector: "", value: "validation_empty_submit", delayMs: 500, optional: false },
        { type: "waitVisible", selectorType: "css", selector: ".error, .field-error, .invalid-feedback, [role='alert'], :invalid", value: "", delayMs: 3000, optional: false },
        { type: "setText", selectorType: "css", selector: "input[type='email']", value: "not-an-email", delayMs: 200, optional: true },
        { type: "click", selectorType: "css", selector: "button[type='submit'], input[type='submit']", value: "", delayMs: 500, optional: false },
        { type: "screenshot", selectorType: "css", selector: "", value: "validation_invalid_email", delayMs: 500, optional: false }
      ],
      variables: [
        { name: "formUrl", defaultValue: "https://example.com/form" }
      ],
      autoRun: false,
      folder: "Templates",
      maxRetries: 1
    }
  }
];
