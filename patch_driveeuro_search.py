#!/usr/bin/env python3
"""
patch_driveeuro_search.py
─────────────────────────
DriveEuroCars — Search Card Remodel Patch
Replaces the homepage search form with the new compact comparison-card layout.

Usage:
    python3 patch_driveeuro_search.py

Requirements:
    • Run from the project root (same directory as index.html)
    • Python 3.6+  (no third-party packages needed)

What this script changes:
    1. Injects new CSS for the compact search card
    2. Adds `inputCls` prop support to LocationInput
    3. Updates SEARCH_DEFAULTS to include diffDropoff + country
    4. Adds setCurrency to HomePage signature and its render call
    5. Replaces the entire search-box JSX with the new card

What this script does NOT touch:
    • Rampex / payment API routes
    • Checkout / confirmation flow
    • Pricing logic
    • Vehicle inventory or images
    • Currency conversion logic
    • Location autofill data
    • Admin dashboard
    • SEO metadata / structured data
    • Footer, legal pages, FAQs, How It Works
"""

import sys
import shutil
import os
from datetime import datetime

# ─────────────────────────────────────────────────────────────────────
# Paths
# ─────────────────────────────────────────────────────────────────────
SOURCE      = os.path.join(os.path.dirname(__file__), "index.html")
BACKUP      = os.path.join(os.path.dirname(__file__), "index.backup.html")

# ─────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────
def die(msg: str) -> None:
    print(f"\n❌  ERROR: {msg}")
    print("    index.html has NOT been modified.")
    sys.exit(1)

def apply(src: str, label: str, old: str, new: str) -> str:
    if old not in src:
        die(
            f"Patch target not found: [{label}]\n"
            "    The file may have already been patched, or differs from the expected source.\n"
            "    Restore from index.backup.html and re-run if needed."
        )
    count = src.count(old)
    if count > 1:
        die(f"Patch target [{label}] matched {count} times — expected exactly 1. Aborting.")
    print(f"  ✓  {label}")
    return src.replace(old, new, 1)

# ─────────────────────────────────────────────────────────────────────
# PATCH 1 — New CSS
# Inserted immediately before the closing </style> tag.
# ─────────────────────────────────────────────────────────────────────
CSS_TARGET = "  /* ── Mobile responsive (≤768px) ── */"

# We locate the CSS anchor (first mobile media query comment) so we
# insert cleanly above it, keeping existing mobile rules intact.
# Actually it is easier and safer to insert before </style>.
CSS_TARGET = "</style>"

NEW_CSS = """\
  /* ═══════════════════════════════════════════════════
     SEARCH CARD — compact DriveEuroCars comparison card
     ═══════════════════════════════════════════════════ */
  .sc-wrap{width:100%;max-width:820px;}
  .sc-card{background:#fff;border-radius:20px;box-shadow:0 8px 40px rgba(0,0,0,.22),0 2px 8px rgba(0,0,0,.10);overflow:hidden;}

  /* Tabs */
  .sc-tabs{display:flex;border-bottom:1.5px solid #E2E8F0;}
  .sc-tab{flex:1;padding:14px 18px;font-family:'Inter',system-ui,sans-serif;font-size:14px;font-weight:600;color:#64748B;background:#F8FAFC;border:none;cursor:pointer;letter-spacing:-.01em;text-align:center;transition:all .18s;}
  .sc-tab:first-child{border-radius:20px 0 0 0;}
  .sc-tab:last-child{border-radius:0 20px 0 0;}
  .sc-tab.sc-active{background:#fff;color:#0F2744;border-bottom:2.5px solid #C9A227;margin-bottom:-1.5px;}
  .sc-tab:hover:not(.sc-active){background:#F0F4F8;color:#0F2744;}

  /* Rows */
  .sc-row{display:flex;align-items:center;gap:14px;padding:14px 20px;border-bottom:1.5px solid #E2E8F0;min-height:66px;position:relative;}
  .sc-row:last-of-type{border-bottom:none;}
  .sc-icon-circle{width:38px;height:38px;border-radius:50%;background:#EEF2F7;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
  .sc-row-body{flex:1;min-width:0;}
  .sc-row-label{display:block;font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:3px;}
  .sc-row-val{font-size:15px;font-weight:600;color:#0F2744;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .sc-row-val.sc-ph{color:#94A3B8;font-weight:400;}

  /* Invisible native control overlay */
  .sc-native{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;font-size:16px;border:none;background:transparent;z-index:5;-webkit-appearance:none;appearance:none;}

  /* Location input */
  .sc-loc-input{width:100%;border:none;outline:none;font-family:'Inter',system-ui,sans-serif;font-size:15px;font-weight:600;color:#0F2744;background:transparent;padding:0;letter-spacing:-.01em;}
  .sc-loc-input::placeholder{color:#94A3B8;font-weight:400;}

  /* Date-time units */
  .sc-dt-pair{display:flex;align-items:center;gap:6px;min-width:0;}
  .sc-dt-unit{position:relative;display:inline-block;}
  .sc-dt-text{font-size:14px;font-weight:600;color:#0F2744;white-space:nowrap;}
  .sc-dt-text.sc-ph{color:#94A3B8;font-weight:400;}
  .sc-dt-arrow{font-size:18px;color:#CBD5E0;flex-shrink:0;padding:0 4px;}

  /* Rental period two-column grid */
  .sc-period{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:0;flex:1;min-width:0;}
  .sc-period-col{display:flex;flex-direction:column;gap:2px;min-width:0;}
  .sc-period-label{font-size:10px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.08em;}

  /* Secondary selectors strip */
  .sc-secondary{display:flex;gap:8px;padding:12px 20px;border-top:1.5px solid #E2E8F0;background:#F8FAFC;flex-wrap:wrap;}
  .sc-sel{flex:1;min-width:90px;font-family:'Inter',system-ui,sans-serif;font-size:13px;font-weight:600;color:#0F2744;background:#fff;border:1.5px solid #E2E8F0;border-radius:10px;padding:9px 26px 9px 10px;outline:none;cursor:pointer;-webkit-appearance:none;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath fill='%2394A3B8' d='M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 8px center;background-size:15px;transition:border-color .15s;max-width:100%;}
  .sc-sel:focus{border-color:#0F2744;}

  /* Search button */
  .sc-btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:17px 24px;background:linear-gradient(135deg,#0F2744 0%,#091C33 100%);color:#fff;font-family:'Inter',system-ui,sans-serif;font-size:17px;font-weight:700;border:none;cursor:pointer;letter-spacing:-.02em;transition:opacity .18s;box-shadow:0 4px 20px rgba(9,28,51,.4);}
  .sc-btn:hover{opacity:.88;}
  .sc-btn:active{opacity:.78;}

  /* Promo cards */
  .sc-promo-row{display:flex;gap:12px;margin-top:14px;max-width:820px;}
  .sc-promo{flex:1;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:14px 16px;}
  .sc-promo-title{font-size:13px;font-weight:700;color:#fff;margin-bottom:3px;}
  .sc-promo-text{font-size:12px;color:rgba(255,255,255,.60);line-height:1.5;}

  /* Pill */
  .sc-pill{display:flex;align-items:center;justify-content:center;gap:6px 18px;background:rgba(201,162,39,.14);border:1px solid rgba(201,162,39,.32);border-radius:30px;padding:10px 20px;font-size:13px;color:#f0c84a;font-weight:500;width:100%;flex-wrap:wrap;margin-top:10px;max-width:820px;}
  .sc-pill-item{display:flex;align-items:center;gap:5px;}
  .sc-pill-sep{opacity:.35;}

  /* Mobile overrides */
  @media(max-width:640px){
    .sc-card{border-radius:16px;}
    .sc-tab{font-size:13px;padding:12px 10px;}
    .sc-tab:first-child{border-radius:16px 0 0 0;}
    .sc-tab:last-child{border-radius:0 16px 0 0;}
    .sc-row{padding:12px 14px;gap:10px;min-height:60px;}
    .sc-icon-circle{width:34px;height:34px;}
    .sc-dt-text{font-size:13px;}
    .sc-secondary{padding:10px 14px;gap:6px;}
    .sc-sel{font-size:12px;padding:8px 22px 8px 8px;min-width:75px;}
    .sc-btn{font-size:15px;padding:15px 20px;}
    .sc-promo-row{flex-direction:column;margin-top:10px;}
    .sc-pill{font-size:12px;padding:9px 14px;}
  }

</style>"""

# ─────────────────────────────────────────────────────────────────────
# PATCH 2 — LocationInput: add inputCls prop to signature
# ─────────────────────────────────────────────────────────────────────
LOC_SIG_OLD = "function LocationInput({ value, onChange, placeholder, onSelect }) {"
LOC_SIG_NEW = "function LocationInput({ value, onChange, placeholder, onSelect, inputCls }) {"

# ─────────────────────────────────────────────────────────────────────
# PATCH 3 — LocationInput: use inputCls on the <input> element
# ─────────────────────────────────────────────────────────────────────
LOC_INPUT_OLD = '        className="form-input"\n        placeholder={placeholder}\n        value={value}\n        onChange={e => { onChange(e.target.value); setOpen(true); setHov(-1); }}\n        onFocus={() => setOpen(true)}\n        onKeyDown={onKey}\n        autoComplete="off"'

LOC_INPUT_NEW = '        className={inputCls || "form-input"}\n        placeholder={placeholder}\n        value={value}\n        onChange={e => { onChange(e.target.value); setOpen(true); setHov(-1); }}\n        onFocus={() => setOpen(true)}\n        onKeyDown={onKey}\n        autoComplete="off"'

# ─────────────────────────────────────────────────────────────────────
# PATCH 4 — SEARCH_DEFAULTS: add diffDropoff + country
# ─────────────────────────────────────────────────────────────────────
DEFAULTS_OLD = "const SEARCH_DEFAULTS = { pickup:'', dropoff:'', pickupCode:'', dropoffCode:'', pickupDate:'', pickupTime:'10:00', returnDate:'', returnTime:'10:00', driverAge:'30-65', vehicleType:'' };"
DEFAULTS_NEW = "const SEARCH_DEFAULTS = { pickup:'', dropoff:'', pickupCode:'', dropoffCode:'', pickupDate:'', pickupTime:'10:00', returnDate:'', returnTime:'10:00', driverAge:'30-65', vehicleType:'', country:'', diffDropoff:false };"

# ─────────────────────────────────────────────────────────────────────
# PATCH 5a — HomePage function signature: add setCurrency
# ─────────────────────────────────────────────────────────────────────
HP_SIG_OLD = "function HomePage({ navigate, searchParams, setSearchParams, currency, fmt }) {"
HP_SIG_NEW = "function HomePage({ navigate, searchParams, setSearchParams, currency, setCurrency, fmt }) {"

# ─────────────────────────────────────────────────────────────────────
# PATCH 5b — App render call: pass setCurrency to HomePage
# ─────────────────────────────────────────────────────────────────────
HP_RENDER_OLD = "{page==='home'         && <HomePage navigate={navigate} searchParams={searchParams} setSearchParams={setSearchParams} currency={currency} fmt={fmt}/>}"
HP_RENDER_NEW = "{page==='home'         && <HomePage navigate={navigate} searchParams={searchParams} setSearchParams={setSearchParams} currency={currency} setCurrency={setCurrency} fmt={fmt}/>}"

# ─────────────────────────────────────────────────────────────────────
# PATCH 6 — Replace the entire search-box JSX block in HomePage
#
# OLD: from <div className="search-box"> through the closing </div>
#      of the <div style={{marginTop:'1rem'...}}> button row beneath it.
#
# We match the block precisely using its unique opening and closing text.
# ─────────────────────────────────────────────────────────────────────
SEARCH_OLD = """\
          <div className="search-box">
            <div className="search-grid">
              <div className="form-group">
                <label className="form-label">Pickup location</label>
                <LocationInput value={local.pickup} onChange={v=>set('pickup',v)} placeholder="Where are you collecting from?" onSelect={loc=>{set('pickup',loc.name);set('pickupCode',loc.locationCode);}}/>
              </div>
              <div className="form-group">
                <label className="form-label">Drop-off location</label>
                <LocationInput value={local.dropoff} onChange={v=>set('dropoff',v)} placeholder="Same location or choose another" onSelect={loc=>{set('dropoff',loc.name);set('dropoffCode',loc.locationCode);}}/>
              </div>
              <div className="form-group">
                <label className="form-label">Pickup date</label>
                <input type="date" className="form-input" value={local.pickupDate} min={today} onChange={e=>handlePickupDateChange(e.target.value)}/>
              </div>
              <div className="form-group">
                <label className="form-label">Pickup time</label>
                <select className="form-input" value={local.pickupTime} onChange={e=>set('pickupTime',e.target.value)}>
                  {TIMES.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Return date</label>
                <input type="date" className="form-input" value={local.returnDate} min={local.pickupDate||today} onChange={e=>handleReturnDateChange(e.target.value)}/>
              </div>
              <div className="form-group">
                <label className="form-label">Return time</label>
                <select className="form-input" value={local.returnTime} onChange={e=>set('returnTime',e.target.value)}>
                  {TIMES.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Driver age</label>
                <select className="form-input" value={local.driverAge} onChange={e=>set('driverAge',e.target.value)}>
                  <option value="">Select driver age</option>
                  <option>Under 21</option><option>21-24</option><option>25-29</option><option value="30-65">30\u201365</option><option>66+</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Vehicle type</label>
                <select className="form-input" value={local.vehicleType} onChange={e=>set('vehicleType',e.target.value)}>
                  <option value="">Choose vehicle type</option><option>Economy</option><option>Premium</option><option>Luxury</option><option>Electric</option><option>SUV</option>
                </select>
              </div>
            </div>
            <div style={{marginTop:'1rem', display:'flex', gap:'1rem', alignItems:'center', flexWrap:'wrap'}}>
              <button className="btn btn-primary" style={{minWidth:200}} onClick={handleSearch}>Search available cars \u2192</button>
              <span style={{fontSize:13, color:'var(--text-faint)'}}>
                {local.pickupDate && local.returnDate ? `${rentalDays}-day rental \u00b7 ` : ''}DriveEuro prices shown
              </span>
            </div>
          </div>"""

SEARCH_NEW = """\
          {/* ── Compact DriveEuroCars search card ── */}
          <div className="sc-wrap">
            <div className="sc-card">

              {/* Tabs */}
              <div className="sc-tabs">
                <button
                  className={`sc-tab${!local.diffDropoff ? ' sc-active' : ''}`}
                  onClick={() => {
                    set('diffDropoff', false);
                    set('dropoff', local.pickup);
                    set('dropoffCode', local.pickupCode);
                  }}
                >
                  Same drop-off
                </button>
                <button
                  className={`sc-tab${local.diffDropoff ? ' sc-active' : ''}`}
                  onClick={() => set('diffDropoff', true)}
                >
                  Different drop-off
                </button>
              </div>

              {/* ── Pickup location ── */}
              <div className="sc-row">
                <div className="sc-icon-circle">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#0F2744"/>
                  </svg>
                </div>
                <div className="sc-row-body">
                  <span className="sc-row-label">
                    {local.diffDropoff ? 'Pickup location' : 'Pickup & drop-off location'}
                  </span>
                  <LocationInput
                    value={local.pickup}
                    onChange={v => {
                      set('pickup', v);
                      if (!local.diffDropoff) set('dropoff', v);
                    }}
                    placeholder="Where are you collecting from?"
                    onSelect={loc => {
                      set('pickup', loc.name);
                      set('pickupCode', loc.locationCode);
                      if (!local.diffDropoff) {
                        set('dropoff', loc.name);
                        set('dropoffCode', loc.locationCode);
                      }
                    }}
                    inputCls="sc-loc-input"
                  />
                </div>
              </div>

              {/* ── Drop-off location (different drop-off only) ── */}
              {local.diffDropoff && (
                <div className="sc-row">
                  <div className="sc-icon-circle">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="#64748B"/>
                    </svg>
                  </div>
                  <div className="sc-row-body">
                    <span className="sc-row-label">Drop-off location</span>
                    <LocationInput
                      value={local.dropoff}
                      onChange={v => set('dropoff', v)}
                      placeholder="Where are you returning the vehicle?"
                      onSelect={loc => {
                        set('dropoff', loc.name);
                        set('dropoffCode', loc.locationCode);
                      }}
                      inputCls="sc-loc-input"
                    />
                  </div>
                </div>
              )}

              {/* ── Rental period: pickup date/time → return date/time ── */}
              <div className="sc-row">
                <div className="sc-icon-circle">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 002 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM7 11h5v5H7z" fill="#0F2744"/>
                  </svg>
                </div>
                <div className="sc-period">

                  {/* Pickup side */}
                  <div className="sc-period-col">
                    <span className="sc-period-label">Pick-up</span>
                    <div className="sc-dt-pair">
                      <div className="sc-dt-unit">
                        <div className={`sc-dt-text${!local.pickupDate ? ' sc-ph' : ''}`}>
                          {local.pickupDate
                            ? new Date(local.pickupDate + 'T12:00:00').toLocaleDateString('en-GB', {weekday:'short', day:'numeric', month:'short'})
                            : 'Date'}
                        </div>
                        <input
                          type="date"
                          className="sc-native"
                          value={local.pickupDate}
                          min={today}
                          onChange={e => handlePickupDateChange(e.target.value)}
                        />
                      </div>
                      <div className="sc-dt-unit">
                        <div className={`sc-dt-text${!local.pickupTime ? ' sc-ph' : ''}`} style={{minWidth:40}}>
                          {local.pickupTime || 'Time'}
                        </div>
                        <select className="sc-native" value={local.pickupTime} onChange={e => set('pickupTime', e.target.value)}>
                          {TIMES.map(t => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="sc-dt-arrow">&#8594;</div>

                  {/* Return side */}
                  <div className="sc-period-col">
                    <span className="sc-period-label">Drop-off</span>
                    <div className="sc-dt-pair">
                      <div className="sc-dt-unit">
                        <div className={`sc-dt-text${!local.returnDate ? ' sc-ph' : ''}`}>
                          {local.returnDate
                            ? new Date(local.returnDate + 'T12:00:00').toLocaleDateString('en-GB', {weekday:'short', day:'numeric', month:'short'})
                            : 'Date'}
                        </div>
                        <input
                          type="date"
                          className="sc-native"
                          value={local.returnDate}
                          min={local.pickupDate || today}
                          onChange={e => handleReturnDateChange(e.target.value)}
                        />
                      </div>
                      <div className="sc-dt-unit">
                        <div className={`sc-dt-text${!local.returnTime ? ' sc-ph' : ''}`} style={{minWidth:40}}>
                          {local.returnTime || 'Time'}
                        </div>
                        <select className="sc-native" value={local.returnTime} onChange={e => set('returnTime', e.target.value)}>
                          {TIMES.map(t => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* ── Driver age ── */}
              <div className="sc-row" style={{cursor:'pointer'}}>
                <div className="sc-icon-circle">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="#0F2744"/>
                  </svg>
                </div>
                <div className="sc-row-body" style={{position:'relative'}}>
                  <span className="sc-row-label">Driver's age</span>
                  <div className={`sc-row-val${!local.driverAge ? ' sc-ph' : ''}`}>
                    {({'Under 21':'Under 21','21-24':'21\u201324','25-29':'25\u201329','30-65':'30\u201365','66+':'66+'})[local.driverAge] || (local.driverAge || 'Select driver age')}
                  </div>
                  <select className="sc-native" value={local.driverAge} onChange={e => set('driverAge', e.target.value)}>
                    <option value="">Select driver age</option>
                    <option value="Under 21">Under 21</option>
                    <option value="21-24">21\u201324</option>
                    <option value="25-29">25\u201329</option>
                    <option value="30-65">30\u201365</option>
                    <option value="66+">66+</option>
                  </select>
                </div>
              </div>

              {/* ── Vehicle type / country / currency ── */}
              <div className="sc-secondary">
                <select className="sc-sel" value={local.vehicleType} onChange={e => set('vehicleType', e.target.value)}>
                  <option value="">All vehicle types</option>
                  <option value="Economy">Economy</option>
                  <option value="Premium">Premium</option>
                  <option value="Luxury">Luxury</option>
                  <option value="Electric">Electric</option>
                  <option value="SUV">SUV</option>
                </select>
                <select className="sc-sel" value={local.country || ''} onChange={e => set('country', e.target.value)}>
                  <option value="">All countries</option>
                  <option value="UK">United Kingdom</option>
                  <option value="France">France</option>
                  <option value="Germany">Germany</option>
                  <option value="Spain">Spain</option>
                  <option value="Italy">Italy</option>
                  <option value="Netherlands">Netherlands</option>
                  <option value="Portugal">Portugal</option>
                  <option value="Ireland">Ireland</option>
                </select>
                <select className="sc-sel" value={currency} onChange={e => setCurrency && setCurrency(e.target.value)}>
                  <option value="GBP">\u00a3 GBP</option>
                  <option value="EUR">\u20ac EUR</option>
                  <option value="USD">$ USD</option>
                </select>
              </div>

              {/* ── Search button ── */}
              <button className="sc-btn" onClick={handleSearch}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" fill="#C9A227"/>
                </svg>
                Search
                {local.pickupDate && local.returnDate && (
                  <span style={{opacity:.65, fontWeight:400, fontSize:14}}>
                    &nbsp;\u00b7 {rentalDays} day{rentalDays !== 1 ? 's' : ''}
                  </span>
                )}
              </button>

            </div>{/* /sc-card */}

            {/* Promo cards */}
            <div className="sc-promo-row">
              <div className="sc-promo">
                <div className="sc-promo-title">Save when you compare</div>
                <div className="sc-promo-text">More suppliers. Better prices. One search.</div>
              </div>
              <div className="sc-promo">
                <div className="sc-promo-title">41,000+ searches</div>
                <div className="sc-promo-text">Across the UK and EU</div>
              </div>
            </div>

            {/* Pill */}
            <div className="sc-pill">
              <span className="sc-pill-item">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" fill="#C9A227"/></svg>
                Reserve now, pay 10% upfront
              </span>
              <span className="sc-pill-sep">|</span>
              <span className="sc-pill-item">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="#C9A227"/></svg>
                Flexible cancellation on most cars
              </span>
            </div>

          </div>{/* /sc-wrap */}"""


# ─────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────
def main():
    print()
    print("╔══════════════════════════════════════════════════╗")
    print("║   DriveEuroCars — Search Card Remodel Patch     ║")
    print("╚══════════════════════════════════════════════════╝")
    print()

    # ── Guard: source file must exist ──────────────────────────────
    if not os.path.isfile(SOURCE):
        die(f"index.html not found at: {SOURCE}\n    Run this script from the project root.")

    # ── Read source ────────────────────────────────────────────────
    print(f"  Reading   {SOURCE}")
    with open(SOURCE, "r", encoding="utf-8") as fh:
        src = fh.read()

    original_len = len(src)
    print(f"  File size {original_len:,} bytes")
    print()

    # ── Idempotency guard ──────────────────────────────────────────
    if "sc-card" in src:
        print("⚠️   WARNING: 'sc-card' already found in index.html.")
        print("    This patch may have already been applied.")
        answer = input("    Apply anyway? (y/N): ").strip().lower()
        if answer != "y":
            print("    Aborted. No changes made.")
            sys.exit(0)
        print()

    # ── Backup ────────────────────────────────────────────────────
    print(f"  Backing up → {BACKUP}")
    shutil.copy2(SOURCE, BACKUP)

    # ── Apply patches ─────────────────────────────────────────────
    print()
    print("  Applying patches:")

    # 1 — CSS (insert before </style>)
    src = apply(src, "CSS — new search card styles",
                CSS_TARGET, NEW_CSS)

    # 2 — LocationInput signature
    src = apply(src, "LocationInput — add inputCls to signature",
                LOC_SIG_OLD, LOC_SIG_NEW)

    # 3 — LocationInput <input> className
    src = apply(src, "LocationInput — use inputCls on <input>",
                LOC_INPUT_OLD, LOC_INPUT_NEW)

    # 4 — SEARCH_DEFAULTS
    src = apply(src, "SEARCH_DEFAULTS — add diffDropoff + country",
                DEFAULTS_OLD, DEFAULTS_NEW)

    # 5a — HomePage signature
    src = apply(src, "HomePage — add setCurrency to function signature",
                HP_SIG_OLD, HP_SIG_NEW)

    # 5b — App render call
    src = apply(src, "App — pass setCurrency to <HomePage/>",
                HP_RENDER_OLD, HP_RENDER_NEW)

    # 6 — Replace search form JSX
    src = apply(src, "HomePage — replace search-box JSX with new card",
                SEARCH_OLD, SEARCH_NEW)

    # ── Write output ──────────────────────────────────────────────
    print()
    print(f"  Writing   {SOURCE}")
    with open(SOURCE, "w", encoding="utf-8") as fh:
        fh.write(src)

    new_len = len(src)
    delta   = new_len - original_len

    # ── Final verification: confirm key markers are present ───────
    print()
    print("  Verifying output:")
    checks = [
        ("sc-card class present",           "sc-card"                  in src),
        ("sc-tabs class present",           "sc-tabs"                  in src),
        ("Same drop-off tab present",       "Same drop-off"            in src),
        ("Different drop-off tab present",  "Different drop-off"       in src),
        ("diffDropoff state present",       "diffDropoff"              in src),
        ("inputCls prop present",           "inputCls"                 in src),
        ("setCurrency in HomePage sig",     "setCurrency"              in src),
        ("sc-btn search button present",    "sc-btn"                   in src),
        ("Promo cards present",             "sc-promo"                 in src),
        ("Pill present",                    "sc-pill"                  in src),
        ("Old search-box div removed",      'className="search-box"'  not in src),
        ("Rampex API routes intact",        "create-rampex-payment-link" in src),
        ("Checkout flow intact",            "CheckoutPage"             in src),
        ("Admin portal intact",             "AdminPage"                in src),
        ("Pricing logic intact",            "calcPricing"              in src),
        ("Vehicle inventory intact",        "VEHICLES"                 in src),
        ("Location autofill intact",        "LOCATION_SUGGESTIONS"     in src),
        ("SEO metadata intact",             "og:title"                 in src),
        ("Footer intact",                   "Footer"                   in src),
    ]

    all_ok = True
    for label, ok in checks:
        status = "✓" if ok else "✗"
        print(f"    {status}  {label}")
        if not ok:
            all_ok = False

    print()
    if not all_ok:
        print("❌  One or more verification checks failed.")
        print(f"    Restoring backup → {SOURCE}")
        shutil.copy2(BACKUP, SOURCE)
        print("    index.html has been restored. Check errors above.")
        sys.exit(1)

    # ── Success ───────────────────────────────────────────────────
    print("╔══════════════════════════════════════════════════╗")
    print("║   ✅  Patch applied successfully                 ║")
    print("╚══════════════════════════════════════════════════╝")
    print()
    print(f"  Original size : {original_len:,} bytes")
    print(f"  New size      : {new_len:,} bytes  ({'+' if delta >= 0 else ''}{delta:,} bytes)")
    print(f"  Backup saved  : {BACKUP}")
    print()
    print("  Next steps:")
    print("  1. Open index.html in a browser and test the search card.")
    print("  2. git add index.html")
    print("  3. git commit -m 'feat: remodel homepage search card'")
    print("  4. git push  →  Vercel deploys automatically.")
    print()


if __name__ == "__main__":
    main()
