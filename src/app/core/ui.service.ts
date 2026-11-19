import { Injectable, inject } from '@angular/core';
import { ActionSheetController, AlertController, ToastController } from '@ionic/angular';

export type ToastType = 'success' | 'danger' | 'warning' | 'info';

/** Avisos, confirmaciones y preguntas con el estilo pastel */
@Injectable({ providedIn: 'root' })
export class UiService {
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private sheetCtrl = inject(ActionSheetController);

  async toast(message: string, type: ToastType = 'info', duration = 2800): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration,
      position: 'top',
      cssClass: ['toast-pastel', `toast-${type}`],
    });
    await toast.present();
  }

  /** Devuelve true si la persona confirma */
  async confirm(header: string, message: string, okText = 'Confirmar', danger = false): Promise<boolean> {
    const alert = await this.alertCtrl.create({
      header,
      message,
      cssClass: 'alert-pastel',
      buttons: [
        { text: 'Volver', role: 'cancel' },
        { text: okText, role: 'confirm', cssClass: danger ? 'danger' : '' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'confirm';
  }

  /** Pide un texto (por ejemplo el motivo de un rechazo). Devuelve null si cancelan. */
  async prompt(header: string, message: string, placeholder: string, okText = 'Enviar', danger = false): Promise<string | null> {
    const alert = await this.alertCtrl.create({
      header,
      message,
      cssClass: 'alert-pastel',
      inputs: [{ name: 'text', type: 'textarea', placeholder }],
      buttons: [
        { text: 'Volver', role: 'cancel' },
        { text: okText, role: 'confirm', cssClass: danger ? 'danger' : '' },
      ],
    });
    await alert.present();
    const { role, data } = await alert.onDidDismiss();
    if (role !== 'confirm') return null;
    return String(data?.values?.text ?? '').trim();
  }

  async actionSheet(header: string, buttons: { text: string; role?: string; handler?: () => void }[]): Promise<void> {
    const sheet = await this.sheetCtrl.create({
      header,
      cssClass: 'sheet-pastel',
      buttons: [...buttons, { text: 'Cerrar', role: 'cancel' }],
    });
    await sheet.present();
  }
}