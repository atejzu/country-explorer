import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { appConfig } from '../../../app.config';
import { CountryCard } from './country-card';
import { summary } from '../models/country.fixture';
describe('CountryCard', () => {
  it('renders localized facts, a named real detail link and the 48 × 32 flag', async () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideRouter([])] });
    const fixture = TestBed.createComponent(CountryCard); fixture.componentRef.setInput('country', summary);
    await fixture.whenStable(); const el: HTMLElement = fixture.nativeElement;
    for (const text of ['Slovenija', 'Ljubljana', '2.100.000', 'Evropa']) expect(el.textContent).toContain(text);
    const link = el.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/countries/SVN');
    expect(link.getAttribute('aria-label')).toBe('Ogled države: Slovenija');
    const flag = el.querySelector('img')!;
    expect(flag.alt).toBe(summary.flag.alt); expect(flag.width).toBe(48); expect(flag.height).toBe(32);
    expect(el.querySelector('button')).toBeNull();
  });
});
