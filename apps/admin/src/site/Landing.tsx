import { CalendarDays, CarFront, Images, ShieldCheck, Smartphone, Star } from 'lucide-react';
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

function StoreBadges() {
  return <div className="lp-stores">
    <a className="lp-store play" href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer"><small>GET IT ON</small><strong>Google Play</strong></a>
    {APP_STORE_LIVE
      ? <a className="lp-store" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer"><small>DOWNLOAD ON THE</small><strong>App Store</strong></a>
      : <span className="lp-store soon" aria-disabled="true"><small>COMING SOON ON THE</small><strong>App Store</strong></span>}
  </div>;
}

function Privacy() {
  return <section id="privacy" className="lp-section lp-privacy">
    <p className="lp-eyebrow">Privacy policy</p>
    <h2>Your privacy.</h2>
    <div className="lp-card lp-policy">
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
  return <div className="lp">
    <header className="lp-nav">
      <a href="/" aria-label="SoFlo Suds home"><img src={logo} alt="SoFlo Suds" /></a>
      <nav>
        <a href="#features">Features</a><a href="#services">Services</a><a href="#privacy">Privacy</a>
        <a className="lp-nav-cta" href="#get-the-app">Get the app</a>
      </nav>
    </header>

    <main>
      <section className="lp-hero" style={{ backgroundImage: `linear-gradient(180deg,#08080833,#080808cc 62%,#080808), url(${hero})` }}>
        <p className="lp-eyebrow">SoFlo Suds vehicle care</p>
        <h1>YOUR VEHICLE.<br />ELEVATED.</h1>
        <p className="lp-lede">Detailing, ceramic coating and paint protection built around your vehicle. Book, track and protect, all from one app.</p>
        <StoreBadges />
      </section>

      <section id="features" className="lp-section">
        <p className="lp-eyebrow">The app</p>
        <h2>Great care. Every surface.</h2>
        <div className="lp-grid">
          {features.map(([Icon, title, copy], i) => <div key={title} className={'lp-card lp-feature ' + (i % 2 ? 'mag' : '')}><Icon /><h3>{title}</h3><p>{copy}</p></div>)}
        </div>
      </section>

      <section id="services" className="lp-section">
        <p className="lp-eyebrow">What we do</p>
        <h2>Care that fits your vehicle.</h2>
        <div className="lp-services">
          {services.map(([img, title, copy], i) => <div key={title} className={'lp-service ' + (i % 2 ? 'mag' : '')}><img src={img} alt="" loading="lazy" /><div><h3>{title}</h3><p>{copy}</p></div></div>)}
        </div>
      </section>

      <section id="get-the-app" className="lp-section lp-cta" style={{ backgroundImage: `linear-gradient(90deg,#080808f2,#080808aa), url(${porsche})` }}>
        <h2>Get the SoFlo Suds app.</h2>
        <p>Free to download. Sign up, add your vehicle and book your next visit.</p>
        <StoreBadges />
      </section>

      <Privacy />
    </main>

    <footer className="lp-foot">
      <img src={logo} alt="" />
      <p>© {new Date().getFullYear()} SoFlo Suds. All rights reserved.</p>
      <p><a href="#privacy">Privacy policy</a></p>
    </footer>
  </div>;
}
