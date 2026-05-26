import React, { useState, useEffect, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";

/* ============================================================
   Wagga Fruit Supply — Order Hub
   - Customer order page:  /?c=<customer_token>
   - Admin dashboard:      /admin   (PIN protected)
   Stack: React + Supabase + Netlify Functions (Xero push)
   ============================================================ */

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const AUD = (n) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(
    Number(n || 0)
  );

/* ---------- tiny router ---------- */
function useRoute() {
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname;
  return {
    isAdmin: path.startsWith("/admin"),
    customerToken: params.get("c"),
  };
}

/* ============================================================
   CUSTOMER ORDER PAGE
   ============================================================ */
function CustomerOrder({ token }) {
  const [customer, setCustomer] = useState(null);
  const [products, setProducts] = useState([]);
  const [qty, setQty] = useState({}); // productId -> number
  const [notes, setNotes] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data: cust, error: cErr } = await supabase
          .from("customers")
          .select("*")
          .eq("token", token)
          .single();
        if (cErr || !cust) throw new Error("Order link not recognised.");
        setCustomer(cust);

        const { data: prods } = await supabase
          .from("products")
          .select("*")
          .eq("active", true)
          .order("category")
          .order("name");
        setProducts(prods || []);
      } catch (e) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const lines = useMemo(
    () =>
      products
        .filter((p) => Number(qty[p.id]) > 0)
        .map((p) => ({
          product_id: p.id,
          name: p.name,
          unit: p.unit,
          category: p.category,
          qty: Number(qty[p.id]),
          unit_price: Number(p.price),
          line_total: Number(qty[p.id]) * Number(p.price),
        })),
    [products, qty]
  );

  const total = lines.reduce((s, l) => s + l.line_total, 0);

  const grouped = useMemo(() => {
    const g = {};
    products.forEach((p) => {
      (g[p.category || "Other"] ||= []).push(p);
    });
    return g;
  }, [products]);

  async function placeOrder() {
    if (!lines.length) return;
    setPlacing(true);
    setErr("");
    try {
      const { error } = await supabase.from("orders").insert({
        customer_id: customer.id,
        customer_name: customer.name,
        status: "new",
        delivery_date: deliveryDate || null,
        notes,
        lines,
        total,
      });
      if (error) throw error;
      setDone(true);
    } catch (e) {
      setErr("Could not place order: " + e.message);
    } finally {
      setPlacing(false);
    }
  }

  if (loading) return <Splash>Loading your order page…</Splash>;
  if (err && !customer)
    return <Splash tone="error">{err}</Splash>;

  if (done)
    return (
      <Splash tone="success">
        <div style={{ fontSize: 48, marginBottom: 12 }}>✓</div>
        <h2 style={{ margin: 0 }}>Order received</h2>
        <p style={{ opacity: 0.7 }}>
          Thank you {customer.name}. We'll have it ready
          {deliveryDate ? ` for ${deliveryDate}` : ""}.
        </p>
        <button
          className="btn-ghost"
          onClick={() => {
            setDone(false);
            setQty({});
            setNotes("");
            setDeliveryDate("");
          }}
        >
          Place another order
        </button>
      </Splash>
    );

  return (
    <div className="cust-wrap">
      <header className="cust-head">
        <div className="brand">Ten Thousand Harvests</div>
        <div className="brand-sub">Micro Farming · Oura NSW</div>
        <div className="cust-name">Fresh order for <strong>{customer.name}</strong></div>
      </header>

      <main className="cust-main">
        {Object.entries(grouped).map(([cat, items]) => (
          <section key={cat} className="cat">
            <h3 className="cat-title">{cat}</h3>
            {items.map((p) => (
              <div className="row" key={p.id}>
                <div className="row-info">
                  <div className="row-name">{p.name}</div>
                  <div className="row-sub">
                    {AUD(p.price)} / {p.unit}
                  </div>
                </div>
                <Stepper
                  value={Number(qty[p.id]) || 0}
                  onChange={(v) => setQty({ ...qty, [p.id]: v })}
                  byWeight={p.sold_by_weight}
                  unit={p.unit}
                />
              </div>
            ))}
          </section>
        ))}

        <section className="cat">
          <h3 className="cat-title">Delivery</h3>
          <label className="fld">
            <span>Delivery date</span>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
            />
          </label>
          <label className="fld">
            <span>Notes (optional)</span>
            <textarea
              rows={2}
              value={notes}
              placeholder="Anything we should know…"
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </section>
      </main>

      {lines.length > 0 && (
        <footer className="cust-foot">
          <div className="foot-summary">
            <span>{lines.length} item{lines.length > 1 ? "s" : ""}</span>
            <strong>{AUD(total)}</strong>
          </div>
          <button
            className="btn-primary"
            disabled={placing}
            onClick={placeOrder}
          >
            {placing ? "Placing…" : "Place order"}
          </button>
          {err && <div className="err">{err}</div>}
        </footer>
      )}
    </div>
  );
}

function Stepper({ value, onChange, byWeight, unit }) {
  // weight items step by 0.5 and allow decimals; count items step by 1, whole only
  const step = byWeight ? 0.5 : 1;
  const dec = (n) => Math.round(n * 100) / 100; // avoid float noise

  return (
    <div className="stepper-wrap">
      <div className="stepper">
        <button onClick={() => onChange(dec(Math.max(0, value - step)))}>−</button>
        <input
          inputMode={byWeight ? "decimal" : "numeric"}
          value={value}
          onChange={(e) => {
            const raw = e.target.value;
            if (byWeight) {
              const cleaned = raw.replace(/[^0-9.]/g, "");
              const v = parseFloat(cleaned);
              onChange(isNaN(v) ? 0 : v);
            } else {
              const v = parseInt(raw.replace(/\D/g, "") || "0", 10);
              onChange(v);
            }
          }}
        />
        <button onClick={() => onChange(dec(value + step))}>+</button>
      </div>
      {byWeight && value > 0 && <div className="stepper-unit">{unit}</div>}
    </div>
  );
}

/* ============================================================
   ADMIN DASHBOARD
   ============================================================ */
function Admin() {
  const [authed, setAuthed] = useState(
    sessionStorage.getItem("wfs_admin") === "1"
  );
  const [pin, setPin] = useState("");
  const [tab, setTab] = useState("orders");
  const [checking, setChecking] = useState(false);
  const [pinErr, setPinErr] = useState("");

  async function tryLogin() {
    setChecking(true);
    setPinErr("");
    try {
      // Look up the PIN stored in the database first.
      const { data } = await supabase
        .from("app_settings").select("admin_pin").eq("id", 1).single();
      const dbPin = data?.admin_pin;
      const envPin = import.meta.env.VITE_ADMIN_PIN;
      // DB pin wins if set; env pin is always accepted as a fallback so you can't be locked out.
      const ok = (dbPin && pin === dbPin) || (envPin && pin === envPin);
      if (ok) {
        sessionStorage.setItem("wfs_admin", "1");
        setAuthed(true);
      } else {
        setPinErr("Wrong PIN");
      }
    } catch {
      // if settings table not reachable, fall back to env pin
      if (pin === import.meta.env.VITE_ADMIN_PIN) {
        sessionStorage.setItem("wfs_admin", "1");
        setAuthed(true);
      } else setPinErr("Wrong PIN");
    } finally {
      setChecking(false);
    }
  }

  if (!authed)
    return (
      <Splash>
        <h2>Admin</h2>
        <input
          className="pin"
          type="password"
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && tryLogin()}
        />
        <button className="btn-primary" disabled={checking} onClick={tryLogin}>
          {checking ? "Checking…" : "Enter"}
        </button>
        {pinErr && <div className="err">{pinErr}</div>}
      </Splash>
    );

  return (
    <div className="admin">
      <nav className="admin-nav">
        <div className="brand">Ten Thousand Harvests</div>
        <div className="tabs">
          <button className={tab === "orders" ? "on" : ""} onClick={() => setTab("orders")}>Orders</button>
          <button className={tab === "products" ? "on" : ""} onClick={() => setTab("products")}>Products</button>
          <button className={tab === "customers" ? "on" : ""} onClick={() => setTab("customers")}>Customers</button>
          <button className={tab === "settings" ? "on" : ""} onClick={() => setTab("settings")}>Settings</button>
        </div>
      </nav>
      <div className="admin-body">
        {tab === "orders" && <OrdersTab />}
        {tab === "products" && <ProductsTab />}
        {tab === "customers" && <CustomersTab />}
        {tab === "settings" && <SettingsTab />}
      </div>
    </div>
  );
}

function SettingsTab() {
  const [newPin, setNewPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  // egg batch config
  const [batch, setBatch] = useState(null);
  const [batchMsg, setBatchMsg] = useState("");
  const [batchSaving, setBatchSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("batch_prefix, batch_include_date, batch_suffix_num, batch_rollover_hour")
        .eq("id", 1).single();
      setBatch({
        batch_prefix: data?.batch_prefix || "",
        batch_include_date: data?.batch_include_date !== false,
        batch_suffix_num: data?.batch_suffix_num ?? 1,
        batch_rollover_hour: data?.batch_rollover_hour ?? 0,
      });
    })();
  }, []);

  async function savePin() {
    setMsg("");
    if (newPin.length < 4) { setMsg("PIN should be at least 4 characters."); return; }
    if (newPin !== confirm) { setMsg("PINs don't match."); return; }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("app_settings").update({ admin_pin: newPin }).eq("id", 1);
      if (error) throw error;
      setMsg("✓ Admin PIN updated. Use it next time you log in.");
      setNewPin(""); setConfirm("");
    } catch (e) {
      setMsg("Couldn't save: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveBatch() {
    setBatchMsg("");
    setBatchSaving(true);
    try {
      const { error } = await supabase.from("app_settings").update({
        batch_prefix: batch.batch_prefix.trim(),
        batch_include_date: batch.batch_include_date,
        batch_suffix_num: parseInt(batch.batch_suffix_num, 10) || 1,
        batch_rollover_hour: parseInt(batch.batch_rollover_hour, 10) || 0,
      }).eq("id", 1);
      if (error) throw error;
      setBatchMsg("✓ Egg batch settings saved.");
    } catch (e) {
      setBatchMsg("Couldn't save: " + e.message);
    } finally {
      setBatchSaving(false);
    }
  }

  // live preview of today's batch (Sydney time, with rollover hour)
  function previewBatch() {
    if (!batch) return "";
    const syd = new Date(new Date().toLocaleString("en-US", { timeZone: "Australia/Sydney" }));
    syd.setHours(syd.getHours() - (parseInt(batch.batch_rollover_hour, 10) || 0));
    const y = syd.getFullYear();
    const m = String(syd.getMonth() + 1).padStart(2, "0");
    const d = String(syd.getDate()).padStart(2, "0");
    const parts = [];
    if (batch.batch_prefix.trim()) parts.push(batch.batch_prefix.trim());
    if (batch.batch_include_date) parts.push(`${y}${m}${d}`);
    parts.push(String(parseInt(batch.batch_suffix_num, 10) || 1));
    return parts.join("-");
  }

  return (
    <div>
      <h2>Settings</h2>

      <h3 style={{ fontFamily: "var(--serif)", color: "var(--forest)" }}>Admin PIN</h3>
      <div className="editor" style={{ flexDirection: "column", alignItems: "stretch", maxWidth: 380 }}>
        <label className="fld"><span>New admin PIN</span>
          <input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="New PIN" />
        </label>
        <label className="fld"><span>Confirm new PIN</span>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat PIN" />
        </label>
        <button className="btn-primary" style={{ width: "auto" }} disabled={saving} onClick={savePin}>
          {saving ? "Saving…" : "Change PIN"}
        </button>
        {msg && <div className={msg.startsWith("✓") ? "ok" : "err"} style={{ marginTop: 8 }}>{msg}</div>}
      </div>
      <p className="muted" style={{ marginTop: 8 }}>The PIN opens this admin area. The original setup PIN always keeps working as a backup.</p>

      <h3 style={{ fontFamily: "var(--serif)", color: "var(--forest)", marginTop: 28 }}>Egg batch number</h3>
      <p className="muted" style={{ marginTop: -4 }}>This batch code is stamped on every egg line of an invoice when you push it. The number ticks up automatically each new batch-day; you can also correct it here.</p>
      {!batch ? <p className="muted">Loading…</p> : (
        <div className="editor" style={{ flexDirection: "column", alignItems: "stretch", maxWidth: 420 }}>
          <label className="fld"><span>Prefix (optional — e.g. producer code, leave blank for none)</span>
            <input value={batch.batch_prefix} onChange={(e) => setBatch({ ...batch, batch_prefix: e.target.value })} placeholder="e.g. TTH or NSW123" />
          </label>
          <label className="wcheck" style={{ marginBottom: 10 }}>
            <input type="checkbox" checked={batch.batch_include_date} onChange={(e) => setBatch({ ...batch, batch_include_date: e.target.checked })} />
            include today's date (YYYYMMDD)
          </label>
          <label className="fld"><span>Current number (auto-increments; edit to reset)</span>
            <input type="number" value={batch.batch_suffix_num} onChange={(e) => setBatch({ ...batch, batch_suffix_num: e.target.value })} />
          </label>
          <label className="fld"><span>Day rolls over at (hour, 24h — e.g. 6 = 6am, 0 = midnight)</span>
            <input type="number" min="0" max="23" value={batch.batch_rollover_hour} onChange={(e) => setBatch({ ...batch, batch_rollover_hour: e.target.value })} />
          </label>
          <div className="picked-row" style={{ marginBottom: 10 }}>
            Today's batch will read: <strong>{previewBatch()}</strong>
          </div>
          <button className="btn-primary" style={{ width: "auto" }} disabled={batchSaving} onClick={saveBatch}>
            {batchSaving ? "Saving…" : "Save batch settings"}
          </button>
          {batchMsg && <div className={batchMsg.startsWith("✓") ? "ok" : "err"} style={{ marginTop: 8 }}>{batchMsg}</div>}
        </div>
      )}
    </div>
  );
}

function OrdersTab() {
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(null);
  const [editing, setEditing] = useState(null); // order id being edited
  const [draftLines, setDraftLines] = useState([]); // working copy of lines

  async function load() {
    const { data } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });
    setOrders(data || []);
  }
  useEffect(() => {
    load();
  }, []);

  function startEdit(o) {
    setEditing(o.id);
    // deep copy so edits don't mutate the displayed order until saved
    setDraftLines((o.lines || []).map((l) => ({ ...l })));
  }

  function cancelEdit() {
    setEditing(null);
    setDraftLines([]);
  }

  function updateLine(i, field, raw) {
    const next = draftLines.map((l) => ({ ...l }));
    const v = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
    next[i][field] = isNaN(v) ? 0 : v;
    next[i].line_total = Math.round((next[i].qty || 0) * (next[i].unit_price || 0) * 100) / 100;
    setDraftLines(next);
  }

  const draftTotal = draftLines.reduce((s, l) => s + (l.line_total || 0), 0);

  async function saveEdit(orderId) {
    setBusy(orderId);
    try {
      const total = Math.round(draftTotal * 100) / 100;
      const { error } = await supabase
        .from("orders")
        .update({ lines: draftLines, total })
        .eq("id", orderId);
      if (error) throw error;
      cancelEdit();
      await load();
    } catch (e) {
      alert("Couldn't save: " + e.message);
    } finally {
      setBusy(null);
    }
  }

  async function pushToXero(order) {
    setBusy(order.id);
    try {
      const res = await fetch("/.netlify/functions/xero-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: order.id }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "Push failed");
      await supabase
        .from("orders")
        .update({
          status: "invoiced",
          xero_invoice_id: out.invoiceId,
          xero_invoice_number: out.invoiceNumber,
          egg_batch: out.eggBatch || null,
        })
        .eq("id", order.id);
      await load();
    } catch (e) {
      alert("Xero push failed: " + e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="bar">
        <h2>Orders</h2>
        <a className="btn-ghost" href="/.netlify/functions/xero-auth">
          Connect Xero
        </a>
      </div>
      {orders.map((o) => {
        const isEditing = editing === o.id;
        return (
        <div className="card" key={o.id}>
          <div className="card-top">
            <div>
              <strong>{o.customer_name}</strong>
              <span className={"badge badge-" + o.status}>{o.status}</span>
            </div>
            <div className="muted">
              {new Date(o.created_at).toLocaleString("en-AU")}
            </div>
          </div>

          <table className="lines">
            <tbody>
              {(isEditing ? draftLines : (o.lines || [])).map((l, i) => (
                <tr key={i}>
                  {isEditing ? (
                    <>
                      <td>
                        <input
                          className="line-edit"
                          inputMode="decimal"
                          value={l.qty}
                          onChange={(e) => updateLine(i, "qty", e.target.value)}
                        />
                        <span className="muted"> {l.unit} × {l.name}</span>
                      </td>
                      <td className="r">
                        @ <input
                          className="line-edit"
                          inputMode="decimal"
                          value={l.unit_price}
                          onChange={(e) => updateLine(i, "unit_price", e.target.value)}
                        />
                      </td>
                      <td className="r">{AUD(l.line_total)}</td>
                    </>
                  ) : (
                    <>
                      <td>{l.qty} {l.unit ? l.unit + " " : ""}× {l.name}</td>
                      <td className="r muted">@ {AUD(l.unit_price)}</td>
                      <td className="r">{AUD(l.line_total)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {o.delivery_date && (
            <div className="muted">Deliver: {o.delivery_date}</div>
          )}
          {o.notes && <div className="muted">Note: {o.notes}</div>}
          {o.egg_batch && (
            <div className="batch-note">🥚 Egg batch: <strong>{o.egg_batch}</strong> (on invoice)</div>
          )}

          <div className="card-foot">
            <strong>{AUD(isEditing ? draftTotal : o.total)}</strong>
            <div style={{ display: "flex", gap: 8 }}>
              {o.status === "invoiced" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span className="ok">✓ {o.xero_invoice_number || "In Xero"}</span>
                  {o.xero_invoice_id && (
                    <a
                      className="btn-ghost"
                      href={`https://go.xero.com/app/invoicing/edit/${o.xero_invoice_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View / print in Xero ↗
                    </a>
                  )}
                </div>
              ) : isEditing ? (
                <>
                  <button className="btn-ghost" onClick={cancelEdit}>Cancel</button>
                  <button className="btn-primary sm" disabled={busy === o.id} onClick={() => saveEdit(o.id)}>
                    {busy === o.id ? "Saving…" : "Save changes"}
                  </button>
                </>
              ) : (
                <>
                  <button className="btn-ghost" onClick={() => startEdit(o)}>Edit</button>
                  <button
                    className="btn-primary sm"
                    disabled={busy === o.id}
                    onClick={() => pushToXero(o)}
                  >
                    {busy === o.id ? "Pushing…" : "Push to Xero"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        );
      })}
      {!orders.length && <p className="muted">No orders yet.</p>}
    </div>
  );
}

function ProductsTab() {
  const [products, setProducts] = useState([]);
  const blank = { name: "", category: "Mushrooms", unit: "kg", price: "", active: true, sold_by_weight: false };
  const [form, setForm] = useState(blank);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  async function load() {
    const { data } = await supabase.from("products").select("*").order("name");
    setProducts(data || []);
  }
  useEffect(() => { load(); }, []);

  async function syncFromXero() {
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await fetch("/.netlify/functions/xero-sync-products");
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "Sync failed");
      setSyncMsg(`✓ ${out.added} added, ${out.updated} updated (${out.total} Xero items)`);
      load();
    } catch (e) {
      setSyncMsg("Sync failed: " + e.message);
    } finally {
      setSyncing(false);
    }
  }

  async function save() {
    if (!form.id) return; // edit-only; no manual adds
    await supabase.from("products").update({
      category: form.category,
      unit: form.unit,
      sold_by_weight: form.sold_by_weight,
      active: form.active,
    }).eq("id", form.id);
    setForm(blank);
    load();
  }
  async function toggleActive(p) {
    await supabase.from("products").update({ active: !p.active }).eq("id", p.id);
    load();
  }

  // Xero "add item" page (new tab)
  const XERO_ITEMS_URL = "https://go.xero.com/Items/Items.aspx";

  return (
    <div>
      <div className="bar">
        <h2>Products</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="btn-ghost" href={XERO_ITEMS_URL} target="_blank" rel="noopener noreferrer">
            + Add in Xero ↗
          </a>
          <button className="btn-ghost" onClick={syncFromXero} disabled={syncing}>
            {syncing ? "Syncing…" : "⟳ Sync from Xero"}
          </button>
        </div>
      </div>
      <p className="muted" style={{ marginTop: -6, marginBottom: 14 }}>
        Products come from Xero. Add new ones in Xero, then click Sync. Use “edit” below to set how each one is sold (by weight / count) and to show or hide it from chefs.
      </p>
      {syncMsg && <div className={syncMsg.startsWith("✓") ? "ok" : "err"} style={{ marginBottom: 12 }}>{syncMsg}</div>}

      {form.id && (
        <div className="editor" style={{ alignItems: "center" }}>
          <strong style={{ marginRight: 4 }}>{form.name}</strong>
          <span className="muted">{AUD(form.price)} (from Xero)</span>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option>Mushrooms</option>
            <option>Eggs</option>
            <option>Microgreens</option>
            <option>Other</option>
          </select>
          <input style={{ maxWidth: 130 }} placeholder="Unit (kg, dozen)" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          <label className="wcheck">
            <input type="checkbox" checked={!!form.sold_by_weight} onChange={(e) => setForm({ ...form, sold_by_weight: e.target.checked })} />
            by weight
          </label>
          <button className="btn-primary" style={{ width: "auto" }} onClick={save}>Save</button>
          <button className="btn-ghost" onClick={() => setForm(blank)}>Cancel</button>
        </div>
      )}

      <table className="grid">
        <thead><tr><th>Name</th><th>Category</th><th>Unit</th><th>Sold by</th><th className="r">Price</th><th>Shown?</th><th></th></tr></thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} style={{ opacity: p.active ? 1 : 0.5 }}>
              <td>{p.name}</td><td>{p.category}</td><td>{p.unit}</td>
              <td>{p.sold_by_weight ? "weight" : "count"}</td>
              <td className="r">{AUD(p.price)}</td>
              <td>
                <button className="link" onClick={() => toggleActive(p)}>
                  {p.active ? "shown" : "hidden"}
                </button>
              </td>
              <td className="r">
                <button className="link" onClick={() => setForm(p)}>edit</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!products.length && <p className="muted">No products yet — click “Sync from Xero”.</p>}
    </div>
  );
}

function CustomersTab() {
  const [customers, setCustomers] = useState([]);
  const blank = { name: "", xero_contact_id: "", token: "", email: "" };
  const [form, setForm] = useState(blank);

  // Xero contact search state
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [picked, setPicked] = useState(false); // a Xero contact has been chosen
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  async function load() {
    const { data } = await supabase.from("customers").select("*").order("name");
    setCustomers(data || []);
  }
  useEffect(() => { load(); }, []);

  async function syncFromXero() {
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await fetch("/.netlify/functions/xero-sync-contacts");
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "Sync failed");
      setSyncMsg(`✓ ${out.added} added, ${out.updated} updated (${out.total} Xero customers)`);
      load();
    } catch (e) {
      setSyncMsg("Sync failed: " + e.message);
    } finally {
      setSyncing(false);
    }
  }

  // debounced Xero search as you type
  useEffect(() => {
    if (picked || search.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      setSearchErr("");
      try {
        const res = await fetch(
          "/.netlify/functions/xero-contacts?q=" + encodeURIComponent(search.trim())
        );
        const out = await res.json();
        if (!res.ok) throw new Error(out.error || "Search failed");
        setResults(out.contacts || []);
      } catch (e) {
        setSearchErr(e.message);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [search, picked]);

  function pickContact(c) {
    setForm({ ...form, name: c.name, xero_contact_id: c.id });
    setSearch(c.name);
    setPicked(true);
    setResults([]);
  }

  function genToken() {
    return Math.random().toString(36).slice(2, 10);
  }

  function resetForm() {
    setForm(blank);
    setSearch("");
    setResults([]);
    setPicked(false);
    setSearchErr("");
  }

  async function save() {
    if (!form.name) return;
    const payload = { ...form, token: form.token || genToken() };
    if (form.id) await supabase.from("customers").update(payload).eq("id", form.id);
    else await supabase.from("customers").insert(payload);
    resetForm();
    load();
  }

  function editCustomer(c) {
    setForm(c);
    setSearch(c.name);
    setPicked(true);
    setResults([]);
  }

  const base = window.location.origin;

  function inviteMessage(c) {
    const link = `${base}/?c=${c.token}`;
    return `Hi! You can now order fresh produce from Ten Thousand Harvests online.

Your personal order page:
${link}

HOW TO ORDER
Open the link, tap + to add items and quantities, pick a delivery date, then tap "Place order". That's it — we'll get it ready.

SAVE IT TO YOUR PHONE (so it's one tap, like an app)
iPhone (Safari): open the link, tap the Share button (square with an arrow), scroll down and tap "Add to Home Screen", then "Add".
Android (Chrome): open the link, tap the ⋮ menu (top right), tap "Add to Home screen", then "Add".

Or just bookmark the link in your browser if you prefer.

Any questions, just reply here. Thanks!
Ten Thousand Harvests`;
  }

  function copyInvite(c) {
    navigator.clipboard.writeText(inviteMessage(c));
  }

  function emailInvite(c) {
    const subject = encodeURIComponent("Your Ten Thousand Harvests order page");
    const body = encodeURIComponent(inviteMessage(c));
    const to = c.email ? encodeURIComponent(c.email) : "";
    window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
  }

  return (
    <div>
      <div className="bar">
        <h2>Customers</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="btn-ghost" href="https://go.xero.com/Contacts/" target="_blank" rel="noopener noreferrer">
            + Add in Xero ↗
          </a>
          <button className="btn-ghost" onClick={syncFromXero} disabled={syncing}>
            {syncing ? "Syncing…" : "⟳ Sync all from Xero"}
          </button>
        </div>
      </div>
      <p className="muted" style={{ marginTop: -6, marginBottom: 14 }}>
        Customers come from Xero. Add a new contact in Xero, then click Sync. Use “edit” to add an email for sending invites.
      </p>
      {syncMsg && <div className={syncMsg.startsWith("✓") ? "ok" : "err"} style={{ marginBottom: 12 }}>{syncMsg}</div>}

      {form.id && (
        <div className="editor" style={{ alignItems: "center" }}>
          <strong style={{ marginRight: 4 }}>{form.name}</strong>
          <label className="fld" style={{ flex: 1, marginBottom: 0 }}>
            <span>Chef's email (for invites)</span>
            <input
              type="email"
              placeholder="chef@restaurant.com"
              value={form.email || ""}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <button className="btn-primary" style={{ width: "auto" }} onClick={save}>Save</button>
          <button className="btn-ghost" onClick={resetForm}>Cancel</button>
        </div>
      )}

      <table className="grid">
        <thead><tr><th>Name</th><th>Email</th><th>Invite</th><th></th></tr></thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td className="muted">{c.email || "—"}</td>
              <td>
                <button className="link" onClick={() => copyInvite(c)}>copy invite</button>
                <button className="link" onClick={() => emailInvite(c)}>email</button>
                <button className="link" onClick={() => navigator.clipboard.writeText(`${base}/?c=${c.token}`)}>copy link</button>
              </td>
              <td className="r"><button className="link" onClick={() => editCustomer(c)}>edit</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- shared ---------- */
function Splash({ children, tone }) {
  return (
    <div className={"splash " + (tone || "")}>
      <div className="splash-card">{children}</div>
    </div>
  );
}

export default function App() {
  const { isAdmin, customerToken } = useRoute();
  if (isAdmin) return <Admin />;
  if (customerToken) return <CustomerOrder token={customerToken} />;
  return (
    <Splash tone="error">
      <h2>No order link</h2>
      <p className="muted">Use the link we sent you, or visit /admin.</p>
    </Splash>
  );
}
