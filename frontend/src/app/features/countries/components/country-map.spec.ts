import { TestBed } from '@angular/core/testing';
import { CountryMap } from './country-map';
const leaflet = vi.hoisted(() => ({
  map: { setView: vi.fn(), remove: vi.fn(), invalidateSize: vi.fn(), attributionControl: { setPrefix: vi.fn() } },
  createMap: vi.fn(), tiles: vi.fn(), zoom: vi.fn(), addTo: vi.fn(),
}));
vi.mock('leaflet', () => ({ map: leaflet.createMap, tileLayer: leaflet.tiles, control: { zoom: leaflet.zoom } }));
describe('CountryMap lifecycle', () => {
  it('creates after render, updates coordinates, observes resizing and disposes on destroy', async () => {
    leaflet.createMap.mockReturnValue(leaflet.map); leaflet.tiles.mockReturnValue({ addTo: leaflet.addTo });
    leaflet.zoom.mockReturnValue({ addTo: leaflet.addTo });
    const disconnect = vi.fn(); const observe = vi.fn();
    let notifyResize: () => void = () => { throw new Error('ResizeObserver was not created'); };
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { notifyResize = () => callback([], this); }
      observe = observe; disconnect = disconnect; unobserve = vi.fn();
    });
    try {
      const fixture = TestBed.createComponent(CountryMap);
      fixture.componentRef.setInput('latitude', 46); fixture.componentRef.setInput('longitude', 15);
      fixture.componentRef.setInput('countryName', 'Slovenija'); await fixture.whenStable();
      expect(leaflet.createMap).toHaveBeenCalledTimes(1); expect(leaflet.map.setView).toHaveBeenLastCalledWith([46, 15], 5, { animate: false });
      expect(leaflet.tiles).toHaveBeenCalledWith('https://tile.openstreetmap.org/{z}/{x}/{y}.png', expect.objectContaining({ attribution: expect.stringContaining('OpenStreetMap contributors') }));
      expect(leaflet.zoom).toHaveBeenCalledWith({ zoomInTitle: 'Povečaj', zoomOutTitle: 'Pomanjšaj' });
      expect(fixture.nativeElement.querySelector('[aria-label="Zemljevid: Slovenija"]')).not.toBeNull();
      expect(observe).toHaveBeenCalledTimes(1);
      notifyResize();
      expect(leaflet.map.invalidateSize).toHaveBeenCalledExactlyOnceWith({ animate: false });
      fixture.componentRef.setInput('latitude', 48); await fixture.whenStable();
      expect(leaflet.createMap).toHaveBeenCalledTimes(1); expect(leaflet.map.setView).toHaveBeenLastCalledWith([48, 15], 5, { animate: false });
      fixture.destroy(); expect(disconnect).toHaveBeenCalledOnce(); expect(leaflet.map.remove).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
  });
});
