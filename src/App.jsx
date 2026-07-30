import { useEffect, useMemo, useState } from 'react';
import { fetchSearchResults, getDistricts, submitListing } from './services/searchService.js';

const FALLBACK_DISTRICTS = ['Lambrate','Città Studi','Piola','Loreto','Isola','Bicocca','Navigli','Porta Romana','NoLo','Bovisa','De Angeli','San Siro','Romolo','Famagosta','Porta Venezia'];

function Header() {
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">N</div>
        <div>
          <strong>Nesty</strong>
          <span>Affitti intelligenti a Milano</span>
        </div>
      </div>
      <a className="top-link" href="#add-listing">Aggiungi annuncio</a>
    </header>
  );
}

function ScorePill({ label, value }) {
  const hasValue = value !== null && value !== undefined;
  const n = Number(value || 0);
  const tone = n >= 8.5 ? 'excellent' : n >= 7 ? 'strong' : n >= 6 ? 'neutral' : 'weak';
  return (
    <div className={`score-pill ${tone}`}>
      <span>{label}</span>
      <b>{hasValue ? n.toFixed(1) : 'n/d'}</b>
    </div>
  );
}

function ListingCard({ item }) {
  const delta = item.median_price && item.price
    ? Math.round(((Number(item.price) - Number(item.median_price)) / Number(item.median_price)) * 100)
    : null;

  const title = item.listing_type === 'room' ? 'Stanza' : 'Appartamento';
  const score = item.score ?? item.nesty_score;

  return (
    <article className="card listing-card">
      <div className="listing-header">
        <div>
          <p className="kicker">{title} · {item.district_name || 'Milano'}</p>
          <h3>{title} a {item.district_name || 'Milano'}</h3>
        </div>
        <div className="listing-price">€ {Number(item.price || 0).toLocaleString('it-IT')}</div>
      </div>

      <div className="score-row">
        <ScorePill label="Nesty" value={score} />
        <ScorePill label="Opportunità" value={item.opportunity_score} />
        <ScorePill label="Prezzo" value={item.price_score} />
      </div>

      <div className="meta-grid">
        <span>{item.size_mq ? `${item.size_mq} mq` : 'Mq n/d'}</span>
        <span>{item.expenses_included ? 'Spese incluse' : 'Spese da verificare'}</span>
        <span>{item.median_price ? `Benchmark € ${Number(item.median_price).toLocaleString('it-IT')}` : 'Benchmark in aggiornamento'}</span>
        <span>{delta === null ? 'Delta mercato n/d' : `${delta > 0 ? '+' : ''}${delta}% vs mercato`}</span>
      </div>

      <p className="verdict">{item.verdict || 'Annuncio acquisito: valutazione in aggiornamento.'}</p>

      <div className="actions">
        {item.url ? <a href={item.url} target="_blank" rel="noreferrer">Apri annuncio</a> : <button disabled>Link non disponibile</button>}
        <button>Salva alert</button>
      </div>
    </article>
  );
}

function ListingIntake({ districts, onCreated }) {
  const [form, setForm] = useState({ listingType: 'room', districtName: 'Lambrate', price: '', sizeMq: '', roomType: 'single', expensesIncluded: false, title: '', url: '', text: '' });
  const [status, setStatus] = useState('');
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  async function save(e) {
    e.preventDefault();
    setStatus('Salvataggio in corso...');
    try {
      await submitListing(form);
      setStatus('Annuncio acquisito correttamente.');
      onCreated?.();
    } catch (err) {
      setStatus('Non sono riuscito a salvare l’annuncio. Verifica i dati inseriti.');
    }
  }

  return (
    <section id="add-listing" className="card intake-card">
      <div className="section-heading">
        <p className="kicker">Input dati</p>
        <h2>Analizza un annuncio online</h2>
        <p>Inserisci un annuncio reale: Nesty lo salva, lo normalizza e lo rende disponibile nei risultati.</p>
      </div>
      <form onSubmit={save}>
        <div className="form-grid">
          <label>Tipo<select value={form.listingType} onChange={e => set('listingType', e.target.value)}><option value="room">Stanza</option><option value="apartment">Appartamento</option></select></label>
          <label>Zona<select value={form.districtName} onChange={e => set('districtName', e.target.value)}>{districts.map(d => <option key={d}>{d}</option>)}</select></label>
          <label>Prezzo<input type="number" value={form.price} onChange={e => set('price', e.target.value)} placeholder="720" /></label>
          <label>Mq<input type="number" value={form.sizeMq} onChange={e => set('sizeMq', e.target.value)} placeholder="18" /></label>
        </div>
        <label>Link annuncio<input value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://..." /></label>
        <label>Titolo<input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Stanza singola a Lambrate" /></label>
        <label>Descrizione<textarea value={form.text} onChange={e => set('text', e.target.value)} placeholder="Incolla qui il testo dell’annuncio" /></label>
        <label className="inline-check"><input type="checkbox" checked={form.expensesIncluded} onChange={e => set('expensesIncluded', e.target.checked)} /> Spese incluse</label>
        <button className="primary full" type="submit">Salva e valuta</button>
        {status && <p className="form-status">{status}</p>}
      </form>
    </section>
  );
}

export default function App() {
  const [listingType, setListingType] = useState('room');
  const [district, setDistrict] = useState('Lambrate');
  const [maxBudget, setMaxBudget] = useState('900');
  const [districts, setDistricts] = useState(FALLBACK_DISTRICTS);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');

  async function search() {
    setLoading(true);
    setNotice('');
    try {
      const data = await fetchSearchResults({ listingType, district, maxBudget });
      setResults(data);
      if (!data.length) setNotice('Nessun annuncio disponibile con questi filtri. Aggiungi un annuncio o collega una sorgente online.');
    } catch {
      setResults([]);
      setNotice('La ricerca è disponibile. Collega una sorgente online per importare nuovi annunci automaticamente.');
    }
    setLoading(false);
  }

  useEffect(() => {
    getDistricts().then(list => { if (list.length) setDistricts(list); });
    search();
  }, []);

  const resultsTitle = useMemo(() => {
    if (loading) return 'Ricerca in corso';
    if (results.length) return `${results.length} annunci trovati`;
    return 'Risultati pronti appena arrivano gli annunci';
  }, [loading, results.length]);

  return (
    <div className="page">
      <Header />
      <main>
        <section className="hero-product">
          <div className="hero-copy">
            <p className="kicker">Nesty Milano</p>
            <h1>Trova casa più velocemente. Capisci se ne vale la pena.</h1>
            <p>Nesty confronta annunci, prezzo, quartiere, mobilità e vivibilità per aiutarti a scegliere meglio e perdere meno tempo.</p>
          </div>
          <div className="search-panel">
            <h2>Cosa stai cercando?</h2>
            <div className="search-controls">
              <select value={listingType} onChange={e => setListingType(e.target.value)}><option value="room">Stanza</option><option value="apartment">Appartamento</option></select>
              <select value={district} onChange={e => setDistrict(e.target.value)}>{districts.map(d => <option key={d}>{d}</option>)}</select>
              <input type="number" value={maxBudget} onChange={e => setMaxBudget(e.target.value)} placeholder="Budget max" />
              <button className="primary" onClick={search}>{loading ? 'Cerco...' : 'Cerca'}</button>
            </div>
          </div>
        </section>

        <section className="results-section">
          <div className="section-heading row">
            <div>
              <p className="kicker">Risultati</p>
              <h2>{resultsTitle}</h2>
              {notice && <p>{notice}</p>}
            </div>
            <button className="secondary" onClick={search}>Aggiorna</button>
          </div>
          <div className="cards-grid">
            {results.map(item => <ListingCard key={item.listing_id} item={item} />)}
          </div>
        </section>

        <ListingIntake districts={districts} onCreated={search} />
      </main>
    </div>
  );
}
