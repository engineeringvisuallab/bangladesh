import type { InfraManager } from '../engineering/InfraManager';
import { TourUI } from '../ui/TourUI';
import { bn } from '../i18n';

export interface TourManagerDeps {
  container: HTMLElement;
  infra: InfraManager;
}

/**
 * The Tour button = Engineering Tour. Click it, pick an engineering site, and that site's guided tour starts by itself
 * (the camera cuts to the site and the narrated stops run one after another). While a tour runs the button stops it.
 * The tour itself is owned by InfraManager (same tour as pressing Y next to a site).
 */
export class TourManager {
  private readonly ui: TourUI;

  constructor(private readonly d: TourManagerDeps) {
    this.ui = new TourUI(d.container, () => this.onButton(), (id) => this.choose(id));
  }

  /** Called by the engine when a site tour starts / ends. */
  setTouring(active: boolean): void {
    this.ui.setTouring(active);
    if (active) {
      this.ui.hideSites();
      this.ui.hideStatus();
    }
  }

  private onButton(): void {
    if (this.d.infra.touring) {
      this.d.infra.stopTour();
      return;
    }
    if (this.ui.isOpen) this.ui.hideSites();
    else this.ui.showSites(this.d.infra.listTours());
  }

  private choose(id: string): void {
    const result = this.d.infra.startById(id);
    if (result === 'blocked') this.ui.showStatus(bn.tour.blocked, 7);
  }

  dispose(): void {
    this.ui.dispose();
  }
}
