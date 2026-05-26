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

function Stepper({ value, onChange }) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(0, value - 1))}>−</button>
      <input
        value={value}
        onChange={(e) => {
          const v = parseInt(e.target.value.replace(/\D/g, "") || "0", 10);
          onChange(v);
        }}
      />
      <button onClick={() => onChange(value + 1)}>+</button>
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
        />
        <button
          className="btn-primary"
          onClick={() => {
            if (pin === import.meta.env.VITE_ADMIN_PIN) {
              sessionStorage.setItem("wfs_admin", "1");
              setAuthed(true);
            } else alert("Wrong PIN");
          }}
        >
          Enter
        </button>
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
        </div>
      </nav>
      <div className="admin-body">
        {tab === "orders" && <OrdersTab />}
        {tab === "products" && <ProductsTab />}
        {tab === "customers" && <CustomersTab />}
      </div>
    </div>
  );
}

function OrdersTab() {
  const [orders, setOrders] = useState([]);
  const [busy, setBusy] = useState(null);

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
      {orders.map((o) => (
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
              {(o.lines || []).map((l, i) => (
                <tr key={i}>
                  <td>{l.qty} × {l.name}</td>
                  <td className="r">{AUD(l.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {o.delivery_date && (
            <div className="muted">Deliver: {o.delivery_date}</div>
          )}
          {o.notes && <div className="muted">Note: {o.notes}</div>}
          <div className="card-foot">
            <strong>{AUD(o.total)}</strong>
            {o.status === "invoiced" ? (
              <span className="ok">✓ {o.xero_invoice_number || "In Xero"}</span>
            ) : (
              <button
                className="btn-primary sm"
                disabled={busy === o.id}
                onClick={() => pushToXero(o)}
              >
                {busy === o.id ? "Pushing…" : "Push to Xero"}
              </button>
            )}
          </div>
        </div>
      ))}
      {!orders.length && <p className="muted">No orders yet.</p>}
    </div>
  );
}

function ProductsTab() {
  const [products, setProducts] = useState([]);
  const blank = { name: "", category: "Mushrooms", unit: "kg", price: "", active: true };
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
    if (!form.name || !form.price) return;
    if (form.id) {
      await supabase.from("products").update(form).eq("id", form.id);
    } else {
      await supabase.from("products").insert(form);
    }
    setForm(blank);
    load();
  }
  async function del(id) {
    if (!confirm("Delete product?")) return;
    await supabase.from("products").delete().eq("id", id);
    load();
  }

  return (
    <div>
      <div className="bar">
        <h2>Products</h2>
        <button className="btn-ghost" onClick={syncFromXero} disabled={syncing}>
          {syncing ? "Syncing…" : "⟳ Sync from Xero"}
        </button>
      </div>
      {syncMsg && <div className={syncMsg.startsWith("✓") ? "ok" : "err"} style={{ marginBottom: 12 }}>{syncMsg}</div>}
      <div className="editor">
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          <option>Mushrooms</option>
          <option>Eggs</option>
          <option>Microgreens</option>
          <option>Other</option>
        </select>
        <input placeholder="Unit (kg, dozen, punnet)" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
        <input placeholder="Price" type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        <button className="btn-primary" onClick={save}>{form.id ? "Update" : "Add"}</button>
        {form.id && <button className="btn-ghost" onClick={() => setForm(blank)}>Cancel</button>}
      </div>
      <table className="grid">
        <thead><tr><th>Name</th><th>Category</th><th>Unit</th><th className="r">Price</th><th></th></tr></thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td><td>{p.category}</td><td>{p.unit}</td>
              <td className="r">{AUD(p.price)}</td>
              <td className="r">
                <button className="link" onClick={() => setForm(p)}>edit</button>
                <button className="link danger" onClick={() => del(p.id)}>del</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CustomersTab() {
  const [customers, setCustomers] = useState([]);
  const blank = { name: "", xero_contact_id: "", token: "" };
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

  return (
    <div>
      <div className="bar">
        <h2>Customers</h2>
        <button className="btn-ghost" onClick={syncFromXero} disabled={syncing}>
          {syncing ? "Syncing…" : "⟳ Sync all from Xero"}
        </button>
      </div>
      {syncMsg && <div className={syncMsg.startsWith("✓") ? "ok" : "err"} style={{ marginBottom: 12 }}>{syncMsg}</div>}

      <div className="editor" style={{ flexDirection: "column", alignItems: "stretch" }}>
        <div style={{ position: "relative" }}>
          <input
            placeholder="Search Xero for a business name…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPicked(false); setForm({ ...form, xero_contact_id: "" }); }}
            autoComplete="off"
          />
          {searching && <div className="muted" style={{ marginTop: 4 }}>Searching Xero…</div>}
          {searchErr && <div className="err">{searchErr}</div>}
          {results.length > 0 && (
            <div className="xresults">
              {results.map((c) => (
                <button key={c.id} className="xresult" onClick={() => pickContact(c)}>
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {form.xero_contact_id && (
          <div className="picked-row">
            ✓ Linked to Xero: <strong>{form.name}</strong>
            <span className="muted"> ({form.xero_contact_id.slice(0, 8)}…)</span>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button className="btn-primary" style={{ width: "auto" }} onClick={save} disabled={!form.xero_contact_id}>
            {form.id ? "Update customer" : "Add customer"}
          </button>
          {(form.id || search) && <button className="btn-ghost" onClick={resetForm}>Clear</button>}
        </div>
        {!form.xero_contact_id && search.length >= 2 && !searching && results.length === 0 && !searchErr && (
          <div className="muted" style={{ marginTop: 6 }}>No Xero match — check the spelling, or the contact may not exist in Xero yet.</div>
        )}
      </div>

      <table className="grid">
        <thead><tr><th>Name</th><th>Order link</th><th></th></tr></thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>
                <code className="link-code">{base}/?c={c.token}</code>
                <button className="link" onClick={() => navigator.clipboard.writeText(`${base}/?c=${c.token}`)}>copy</button>
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
