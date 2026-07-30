import { useEffect, useMemo, useState } from 'react';
import { fetchSearchResults, getDistricts, submitListing } from './services/searchService.js';

const FALLBACK_DISTRICTS = [
  'Lambrate','Città Studi','Piola','Loreto','Isola','Bicocca','Navigli','Porta Romana','NoLo','Bovisa','De Angeli','San Siro','Romolo','Famagosta','Porta Venezia'
];

function Logo() {
  return (
    <div className="logo">
      <span>N</span>
      <div>
        <b>Nesty</b>
        <small>Lo Skyscanner degli affitti a Milano</small>
      </div>
    </div>
  );
}

function ScoreBadge({ label, value }) {
  const visible = value !== null && value !== undefined;
  const n = Number(value || 0);
  const cls = n >= 8.5 ? 'great' : n >= 7 ? 'good' : n >= 6 ? 'mid' : 'low';

  return (
    <div className={`score-badge ${cls}`}>
      <small>{label}</small>
      <strong>{visible ? n.toFixed(1) : 'n/d'}</strong>
    </div>
  );
}

function ListingCard({ item }) {
  const delta = item.median_price && item.price
    ? Math.round(((item.price - item.median_price) / item.median_price) * 100)
    : null;

  const title = item.room_type === 'single'
    ? 'Stanza singola'
    : item.listing_type === 'room'
      ? 'Stanza'
      : 'Appartamento';

  return (
    <article className="listing-card">
      <div className="listing-top">
        <div>
          <p className="eyebrow">{item.listing_type === 'room' ? 'Stanza' : 'Appartamento'} · {item.district_name || 'Milano'}</p>
          <h3>{title} a {item.district_name || 'Milano'}</h3>
        </div>
        <div className="price">€ {Number(item.price || 0).toLocaleString('it-IT')}</div>
      </div>

      <div className="scores">
        <ScoreBadge label="Nesty Score" value={item.score} />
        <ScoreBadge label="Opportunity" value={item.opportunity_score} />
        <ScoreBadge label="Prezzo" value={item.price_score} />
      </div>

      <div className="facts">
        <span>{item.size_mq ? `${item.size_mq} mq` : 'mq non indicati'}</span>
        <span>{item.expenses_included ? 'Spese incluse' : 'Spese da verificare'}</span>
        <span>Benchmark: {item.median_price ? `€ ${Number(item.median_price).toLocaleString('it-IT')}` : 'in costruzione'}</span>
        <span>{delta === null ? 'Delta mercato: n/d' : `Delta mercato: ${delta > 0 ? '+' : ''}${delta}%`}</span>
        <span>Campione: {item.sample_size || 0}</span>
      </div>

      <p className="verdict">{item.verdict || 'Annuncio acquisito. Score in calcolo.'}</p>

      <div className="listing-actions">
        {item.url ? <a href={item.url} target="_blank" rel="noreferrer">Apri annuncio</a> : <button disabled>Link non disponibile</button>}
        <button>Salva alert</button>
      </div>
    </article>
  );
}

function IntakeForm({ districts, onCreated }) {
  const [form, setForm] = useState({
    listingType: 'room',
    districtName: 'Lambrate',
    price: 720,
    sizeMq: 18,
    roomType: 'single',
    expensesIncluded: true,
    title: '',
    url: '',
    text: ''
  });
  const [status, setStatus] = useState('');
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('Salvataggio nel motore Nesty...');
    try {
      await submitListing(form);
      setStatus('Annuncio salvato e valutato. Ora appare nei risultati.');
      onCreated?.();
    } catch (err) {
      setStatus(`Errore: ${err.message}`);
    }
  }

  return (
    <form className="intake" onSubmit={handleSubmit}>
      <div className="section-title compact">
        <span>Alimenta il motore</span>
        <h2>Analizza un annuncio online</h2>
        <p>Incolla link e dettagli dell'annuncio. Nesty salva, normalizza e valuta il dato.</p>
      </div>

      <div className="grid two">
        <label>Tipo
          <select value={form.listingType} onChange={e => set('listingType', e.target.value)}>
            <option value="room">Stanza</option>
            <option value="apartment">Appartamento</option>
          </select>
        </label>
        <label>Zona
          <select value={form.districtName} onChange={e => set('districtName', e.target.value)}>
            {districts.map(d => <option key={d}>{d}</option>)}
          </select>
        </label>
        <label>Prezzo
          <input type="number" value={form.price} onChange={e => set('price', e.target.value)} />
        </label>
        <label>Mq
          <input type="number" value={form.sizeMq} onChange={e => set('sizeMq', e.target.value)} />
        </label>
      </div>

      <label>Link annuncio
        <input value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://..." />
      </label>
      <label>Titolo
        <input value={form.title} onChange={e => set('title', e.target.value)} placeholder="Stanza singola Lambrate 720€" />
      </label>
      <label>Testo annuncio
        <textarea value={form.text} onChange={e => set('text', e.target.value)} placeholder="Incolla descrizione annuncio..." />
      </label>
      <label className="check">
        <input type="checkbox" checked={form.expensesIncluded} onChange={e => set('expensesIncluded', e.target.checked)} /> Spese incluse
      </label>
      <button className="primary" type="submit">Salva e valuta annuncio</button>
      {status && <p className="status">{status}</p>}
    </form>
  );
}

export default function App() {
  const [listingType, setListingType] = useState('room');
  const [district, setDistrict] = useState('Lambrate');
  const [maxBudget, setMaxBudget] = useState('900');
  const [districts, setDistricts] = useState(FALLBACK_DISTRICTS);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function search() {
    setLoading(true);
    setError('');
    try {
      const data = await fetchSearchResults({ listingType, district, maxBudget });
      setResults(data);
    } catch (err) {
      setError(err.message);
      setResults([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    getDistricts().then(list => { if (list.length) setDistricts(list); });
    search();
  }, []);

  const headline = useMemo(() => {
    if (loading) return 'Ricerca in corso...';
    if (!results.length) return 'Nessun annuncio trovato con questi filtri.';
    return `${results.length} annunci trovati, ordinati per opportunità.`;
  }, [results, loading]);

  return (
    <div className="app">
      <header className="hero">
        <nav>
          <Logo />
          <a href="#intake">Inserisci annuncio</a>
        </nav>

        <section className="hero-inner">
          <p className="pill">Nesty Search Engine</p>
          <h1>Cosa stai cercando?</h1>
          <p className="subtitle">Trova stanze e appartamenti a Milano. Nesty confronta prezzo, quartiere, mobilità, servizi e vivibilità per capire quali offerte meritano davvero il tuo tempo.</p>

          <div className="search-box">
            <select value={listingType} onChange={e => setListingType(e.target.value)}>
              <option value="room">Stanza</option>
              <option value="apartment">Appartamento</option>
            </select>
            <select value={district} onChange={e => setDistrict(e.target.value)}>
              {districts.map(d => <option key={d}>{d}</option>)}
            </select>
            <input type="number" value={maxBudget} onChange={e => setMaxBudget(e.target.value)} placeholder="Budget max" />
            <button onClick={search}>Cerca</button>
          </div>
        </section>
      </header>

      <main>
        <section className="results-head">
          <div>
            <span>Risultati</span>
            <h2>{headline}</h2>
            {error && <p className="error">{error}</p>}
          </div>
          <button onClick={search}>{loading ? 'Carico...' : 'Aggiorna'}</button>
        </section>

        <section className="results-grid">
          {results.map(item => <ListingCard key={item.listing_id} item={item} />)}
          {!results.length && (
            <div className="empty">
              <h3>Il motore è pronto.</h3>
              <p>Inserisci un annuncio reale dal modulo sotto: Nesty lo salva, lo valuta e lo rende cercabile.</p>
            </div>
          )}
        </section>

        <section id="intake">
          <IntakeForm districts={districts} onCreated={search} />
        </section>
      </main>
    </div>
  );
}
