import { afterRenderEffect, Component, DestroyRef, ElementRef, inject, input, viewChild } from '@angular/core';
import * as L from 'leaflet';
import { COUNTRY_MAP_TILES } from './map-config';
@Component({ selector: 'app-country-map', template: `
  <div #canvas class="map" role="region" [attr.aria-label]="'Zemljevid: ' + countryName()"></div>
`, styles: `:host { display: block; min-width: 0; } .map { height: 352px; width: 100%; isolation: isolate; border-radius: 16px; }` })
export class CountryMap {
  readonly latitude = input.required<number>();
  readonly longitude = input.required<number>();
  readonly countryName = input.required<string>();
  private readonly canvas = viewChild.required<ElementRef<HTMLElement>>('canvas');
  private map?: L.Map;
  private observer?: ResizeObserver;
  constructor() {
    afterRenderEffect(() => {
      const center: L.LatLngTuple = [this.latitude(), this.longitude()];
      if (!this.map) {
        this.map = L.map(this.canvas().nativeElement, {
          zoomControl: false, scrollWheelZoom: false, zoomAnimation: false, fadeAnimation: false,
          markerZoomAnimation: false, inertia: false,
        });
        L.control.zoom({ zoomInTitle: 'Povečaj', zoomOutTitle: 'Pomanjšaj' }).addTo(this.map);
        this.map.attributionControl.setPrefix(false);
        L.tileLayer(COUNTRY_MAP_TILES.url, { attribution: COUNTRY_MAP_TILES.attribution,
          maxZoom: COUNTRY_MAP_TILES.maxZoom }).addTo(this.map);
        this.observer = new ResizeObserver(() => this.map?.invalidateSize({ animate: false }));
        this.observer.observe(this.canvas().nativeElement);
      }
      this.map.setView(center, 5, { animate: false });
    });
    inject(DestroyRef).onDestroy(() => {
      this.observer?.disconnect();
      this.map?.remove();
      this.map = undefined;
    });
  }
}
