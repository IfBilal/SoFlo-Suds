import { useEffect, useRef, useState } from 'react';
import { CalendarDays, CarFront, ChevronDown, Home, Images, Menu, ShieldCheck, Smartphone, Star, UserRound, X } from 'lucide-react';
import logo from '../logo.webp';
import hero from './hero.jpg';
import ceramic from './ceramic.jpg';
import ppf from './ppf.jpg';
import interior from './interior.jpg';
import correction from './correction.jpg';
import porsche from './porsche.jpg';
import { APP_STORE_LIVE, APP_STORE_URL, PLAY_STORE_URL } from './links';
import './landing.css';

const features = [
  [CalendarDays, 'Book in minutes', 'Pick a service, your vehicle and a time. Pay securely in the booking flow and follow the job from your phone.'],
  [CarFront, 'Your garage', 'Save your vehicles and see every visit, status update and receipt in one place.'],
  [ShieldCheck, 'Protection records', 'Ceramic coating, paint protection film and tint, with warranty details kept on record.'],
  [Star, 'Suds Rewards', 'Earn points on every completed service, redeem rewards and share your code with friends.'],
  [Images, 'Before & after', 'See the finish up close in the work gallery and read what other customers say.'],
  [Smartphone, 'Stay in the loop', 'Optional reminders and updates about your appointments, right on your phone.'],
] as const;

const services = [
  [ceramic, 'Ceramic coating', 'Long-lasting gloss and protection.'],
  [ppf, 'Paint protection film', 'Guard against chips and scratches.'],
  [correction, 'Paint correction', 'Remove swirls and restore depth.'],
  [interior, 'Interior detailing', 'Fresh, clean and carefully finished.'],
] as const;

const steps = [
  ['01', 'Choose your care', 'Browse services, pick your vehicle and see exactly what is included.'],
  ['02', 'Book & pay', 'Choose a time and pay in the secure booking step. No surprises.'],
  ['03', 'Track & earn', 'Follow your job, keep your warranty records and collect Suds Rewards.'],
] as const;

const faqs = [
  ['Is the app free?', 'Yes. Download it, create an account and add your vehicles at no cost. You only pay for the services you book.'],
  ['Where can I get it?', 'The Android app is on Google Play. The iPhone version is coming soon to the App Store.'],
  ['How do I pay?', 'Payment happens in the secure booking step, handled by our booking provider. The app never stores your full card number.'],
  ['Can I delete my account?', 'Anytime. Open Profile in the app and choose delete account. Service and payment records the shop must keep may be retained.'],
] as const;

const marquee = ['Ceramic coating', 'Paint protection film', 'Paint correction', 'Interior detailing', 'Window tint', 'Mobile & shop care'];

/** Adds `.in` to every `.reveal` once it scrolls into view. */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    if (!('IntersectionObserver' in window)) { els.forEach(el => el.classList.add('in')); return; }
    const io = new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .15, rootMargin: '0px 0px -40px 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function StoreBadges() {
  return <div className="lp-stores">
    <a className="lp-store play" href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer"><small>GET IT ON</small><strong>Google Play</strong></a>
    {APP_STORE_LIVE
      ? <a className="lp-store" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer"><small>DOWNLOAD ON THE</small><strong>App Store</strong></a>
      : <span className="lp-store soon" aria-disabled="true"><small>COMING SOON ON THE</small><strong>App Store</strong></span>}
  </div>;
}

/** Animated phone built from the real app's welcome, home and protection screens. */
function Phone() {
  const [i, setI] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setI(n => (n + 1) % 3), 4200);
    return () => clearInterval(t);
  }, [i]);
  function tilt(e: React.MouseEvent) {
    const r = e.currentTarget.getBoundingClientRect();
    ref.current?.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - .5) * 14}deg`);
    ref.current?.style.setProperty('--rx', `${-((e.clientY - r.top) / r.height - .5) * 10}deg`);
  }
  function reset() { ref.current?.style.setProperty('--ry', '0deg'); ref.current?.style.setProperty('--rx', '0deg'); }
  return <div className="lp-phone-wrap" onMouseMove={tilt} onMouseLeave={reset}>
    <div className="lp-phone" ref={ref} aria-label="Preview of the SoFlo Suds app" role="img">
      <div className="lp-notch" />
      <div className={'lp-screen s-welcome ' + (i === 0 ? 'on' : '')} style={{ backgroundImage: `linear-gradient(180deg,#08080833,#080808cc 55%,#080808f5),url(${porsche})` }}>
        <img src={logo} alt="" /><b>YOUR VEHICLE.<br />ELEVATED.</b><em>Certified team.</em><span>Careful attention and clear communication for every surface you love.</span>
        <i className="pbtn mag">Sign up</i><i className="pbtn cy">Log in</i>
      </div>
      <div className={'lp-screen s-home ' + (i === 1 ? 'on' : '')}>
        <p className="hi">Hi, there.</p>
        <div className="phero" style={{ backgroundImage: `linear-gradient(180deg,#08080815,#080808e8 75%,#080808),url(${hero})` }}><small>SOFLO SUDS VEHICLE CARE</small><b>GREAT CARE.<br />EVERY SURFACE.</b></div>
        <div className="pshort">{[[CarFront, 'Vehicles'], [CalendarDays, 'Bookings'], [ShieldCheck, 'Protection'], [Images, 'Gallery']].map(([Ic, l], k) => { const I = Ic as typeof Star; return <span key={String(l)}><I className={k % 2 ? 'mg' : ''} />{String(l)}</span>; })}</div>
        <p className="psec">Care that fits your vehicle.</p>
        <div className="pcards"><div style={{ backgroundImage: `url(${ceramic})` }}><b>Ceramic</b></div><div className="m" style={{ backgroundImage: `url(${ppf})` }}><b>PPF</b></div></div>
      </div>
      <div className={'lp-screen s-prot ' + (i === 2 ? 'on' : '')}>
        <p className="hi">Protection.</p><p className="psub">Your coatings and warranties, on record.</p>
        {['Ceramic coating', 'Paint protection film', 'Window tint'].map((t, k) => <div key={t} className={'prow ' + (k % 2 ? 'm' : '')}><ShieldCheck /><div><b>{t}</b><small>Warranty details saved</small></div></div>)}
        <div className="prew"><Star /><div><b>Suds Rewards</b><small>Points on every completed service</small></div></div>
      </div>
      <div className="lp-tabbar"><Home /><CalendarDays /><Star /><ShieldCheck /><UserRound /></div>
    </div>
    <div className="lp-dots">{[0, 1, 2].map(k => <button key={k} className={k === i ? 'on' : ''} onClick={() => setI(k)} aria-label={`Show screen ${k + 1}`} />)}</div>
  </div>;
}

function Privacy() {
  return <section id="privacy" className="lp-section lp-privacy">
    <div className="reveal"><p className="lp-eyebrow">Privacy policy</p><h2>Your privacy.</h2></div>
    <div className="lp-card lp-policy reveal">
      <h3>What we collect</h3>
      <p>When you create an account we collect your name, email address and, if you add it, your phone number. We also store the vehicles you add, your bookings, reviews, rewards and referral activity, and your notification preferences.</p>
      <h3>How we use it</h3>
      <p>Your details connect you with your bookings and vehicles at SoFlo Suds, power rewards and referrals, and let us send the reminders and updates you opt into. Push notifications are optional and can be turned off in the app or in your phone settings.</p>
      <h3>Payments</h3>
      <p>Card details are entered in the secure payment step of our booking provider, Urable. The SoFlo Suds app and servers do not store full card numbers.</p>
      <h3>Sharing</h3>
      <p>We share booking and customer details with Urable so your service can be scheduled and paid. We do not sell your personal information.</p>
      <h3>Deleting your account</h3>
      <p>You can delete your app account at any time from Profile in the app. This removes access to your profile and anonymizes your app account. Service and payment records held by the shop may be retained where required for business and legal purposes.</p>
      <h3>Contact</h3>
      <p>Questions about your data? Use Contact in the app’s Profile screen to reach the shop.</p>
    </div>
  </section>;
}

export default function Landing() {
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showBar, setShowBar] = useState(false);
  useReveal();
  useEffect(() => {
    const on = () => {
      const y = window.scrollY, max = document.documentElement.scrollHeight - innerHeight;
      setScrolled(y > 24); setProgress(max > 0 ? y / max : 0); setShowBar(y > innerHeight * .7);
      document.documentElement.style.setProperty('--sy', String(y));
    };
    on(); addEventListener('scroll', on, { passive: true });
    return () => removeEventListener('scroll', on);
  }, []);
  const close = () => setMenu(false);
  return <div className="lp">
    <div className="lp-progress" style={{ transform: `scaleX(${progress})` }} />
    <header className={'lp-nav ' + (scrolled ? 'solid' : '')}>
      <a href="#top" aria-label="SoFlo Suds home"><img src={logo} alt="SoFlo Suds" /></a>
      <nav className={menu ? 'open' : ''}>
        <a href="#features" onClick={close}>Features</a><a href="#services" onClick={close}>Services</a><a href="#faq" onClick={close}>FAQ</a><a href="#privacy" onClick={close}>Privacy</a>
        <a className="lp-nav-cta" href="#get-the-app" onClick={close}>Get the app</a>
      </nav>
      <button className="lp-burger" onClick={() => setMenu(m => !m)} aria-label={menu ? 'Close menu' : 'Open menu'} aria-expanded={menu}>{menu ? <X /> : <Menu />}</button>
    </header>

    <main id="top">
      <section className="lp-hero">
        <div className="lp-bg" style={{ backgroundImage: `url(${hero})` }} />
        <div className="lp-glow g1" /><div className="lp-glow g2" />
        <div className="lp-hero-in">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow rise" style={{ '--d': '0s' } as React.CSSProperties}>SoFlo Suds vehicle care</p>
            <h1 className="rise" style={{ '--d': '.1s' } as React.CSSProperties}>YOUR VEHICLE.<br /><span>ELEVATED.</span></h1>
            <p className="lp-lede rise" style={{ '--d': '.25s' } as React.CSSProperties}>Detailing, ceramic coating and paint protection built around your vehicle. Book, track and protect, all from one app.</p>
            <div className="rise" style={{ '--d': '.4s' } as React.CSSProperties}><StoreBadges /></div>
          </div>
          <div className="rise" style={{ '--d': '.3s' } as React.CSSProperties}><Phone /></div>
        </div>
        <a className="lp-scroll" href="#features" aria-label="Scroll down"><ChevronDown /></a>
      </section>

      <div className="lp-marquee" aria-hidden="true"><div>{[...marquee, ...marquee, ...marquee].map((t, k) => <span key={k}>{t}<i /></span>)}</div></div>

      <section id="how" className="lp-section">
        <div className="reveal"><p className="lp-eyebrow">How it works</p><h2>From booking to shine.</h2></div>
        <div className="lp-steps">
          {steps.map(([n, t, c], k) => <div key={n} className="lp-step reveal" style={{ '--i': k } as React.CSSProperties}><span>{n}</span><h3>{t}</h3><p>{c}</p></div>)}
        </div>
      </section>

      <section id="features" className="lp-section">
        <div className="reveal"><p className="lp-eyebrow">The app</p><h2>Great care. Every surface.</h2></div>
        <div className="lp-grid">
          {features.map(([Icon, title, copy], k) => <div key={title} className={'lp-card lp-feature reveal ' + (k % 2 ? 'mag' : '')} style={{ '--i': k % 3 } as React.CSSProperties}><div className="ico"><Icon /></div><h3>{title}</h3><p>{copy}</p></div>)}
        </div>
      </section>

      <section id="services" className="lp-section">
        <div className="reveal"><p className="lp-eyebrow">What we do</p><h2>Care that fits your vehicle.</h2></div>
        <div className="lp-services">
          {services.map(([img, title, copy], k) => <div key={title} className={'lp-service reveal ' + (k % 2 ? 'mag' : '')} style={{ '--i': k } as React.CSSProperties}><div className="im"><img src={img} alt="" loading="lazy" /></div><div className="tx"><h3>{title}</h3><p>{copy}</p></div></div>)}
        </div>
      </section>

      <section id="get-the-app" className="lp-section lp-cta">
        <div className="lp-cta-bg" style={{ backgroundImage: `url(${porsche})` }} />
        <div className="reveal"><h2>Get the SoFlo Suds app.</h2><p>Free to download. Sign up, add your vehicle and book your next visit.</p><StoreBadges /></div>
      </section>

      <section id="faq" className="lp-section">
        <div className="reveal"><p className="lp-eyebrow">Good to know</p><h2>Questions.</h2></div>
        <div className="lp-faq reveal">
          {faqs.map(([q, a]) => <details key={q}><summary>{q}<ChevronDown /></summary><p>{a}</p></details>)}
        </div>
      </section>

      <Privacy />
    </main>

    <footer className="lp-foot">
      <img src={logo} alt="" />
      <p>© {new Date().getFullYear()} SoFlo Suds. All rights reserved.</p>
      <p><a href="#privacy">Privacy policy</a> · <a href="#top">Back to top</a></p>
    </footer>

    <div className={'lp-sticky ' + (showBar ? 'show' : '')}><a href="#get-the-app">Get the app</a></div>
  </div>;
}
