import { Pipe, PipeTransform } from '@angular/core';
import { formatCop, formatKm, initials, statusLabel, statusTone } from './utils';

@Pipe({ name: 'cop' })
export class CopPipe implements PipeTransform {
  transform(value: unknown): string {
    return formatCop(value);
  }
}

@Pipe({ name: 'km' })
export class KmPipe implements PipeTransform {
  transform(value: unknown): string {
    return formatKm(value);
  }
}

@Pipe({ name: 'initials' })
export class InitialsPipe implements PipeTransform {
  transform(value?: string | null): string {
    return initials(value);
  }
}

@Pipe({ name: 'statusLabel' })
export class StatusLabelPipe implements PipeTransform {
  transform(value?: string | null): string {
    return statusLabel(value);
  }
}

@Pipe({ name: 'statusTone' })
export class StatusTonePipe implements PipeTransform {
  transform(value?: string | null): string {
    return statusTone(value);
  }
}