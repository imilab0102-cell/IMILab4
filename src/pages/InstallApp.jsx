import { Smartphone, Monitor, Apple, Chrome, Share, PlusSquare, MoreVertical, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const steps = {
  iphone: [
    { icon: Chrome, text: 'Відкрийте застосунок у браузері Safari' },
    { icon: Share, text: 'Натисніть кнопку «Поділитися» (квадрат зі стрілкою вгору) внизу екрана' },
    { icon: PlusSquare, text: 'Прокрутіть вниз і натисніть «На екран "Домів"»' },
    { icon: Download, text: 'Натисніть «Додати» — іконка застосунку з\'явиться на головному екрані' },
  ],
  android: [
    { icon: Chrome, text: 'Відкрийте застосунок у браузері Chrome' },
    { icon: MoreVertical, text: 'Натисніть три крапки (меню) у правому верхньому куті' },
    { icon: PlusSquare, text: 'Виберіть «Додати на головний екран» або «Встановити застосунок»' },
    { icon: Download, text: 'Підтвердіть — іконка застосунку з\'явиться на головному екрані' },
  ],
  desktop: [
    { icon: Chrome, text: 'Відкрийте застосунок у браузері Chrome або Edge' },
    { icon: Download, text: 'Натисніть іконку «Встановити» (значок +) у правій частині адресного рядка' },
    { icon: PlusSquare, text: 'У діалозі натисніть «Встановити»' },
    { icon: Monitor, text: 'Застосунок відкриється як окреме вікно і з\'явиться на робочому столі' },
  ],
};

function StepList({ steps }) {
  return (
    <ol className="space-y-3 mt-4">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">
            {i + 1}
          </span>
          <span className="text-sm text-foreground leading-relaxed pt-1">{step.text}</span>
        </li>
      ))}
    </ol>
  );
}

export default function InstallApp() {
  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold font-heading text-foreground tracking-tight">
          Встановити застосунок
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Додайте DentLab на телефон або комп'ютер — він працюватиме як звичайний застосунок без браузера
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* iPhone / iPad */}
        <Card className="border-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Apple className="w-5 h-5" />
              iPhone / iPad
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StepList steps={steps.iphone} />
            <div className="mt-4 p-3 rounded-lg bg-muted text-xs text-muted-foreground">
              ⚠️ Використовуйте Safari — лише він підтримує додавання на головний екран на iOS
            </div>
          </CardContent>
        </Card>

        {/* Android */}
        <Card className="border-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone className="w-5 h-5" />
              Android
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StepList steps={steps.android} />
            <div className="mt-4 p-3 rounded-lg bg-muted text-xs text-muted-foreground">
              💡 Підтримується Chrome, Edge та більшість сучасних браузерів
            </div>
          </CardContent>
        </Card>

        {/* Desktop */}
        <Card className="border-2 md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Monitor className="w-5 h-5" />
              Комп'ютер (Windows / Mac)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StepList steps={steps.desktop} />
            <div className="mt-4 p-3 rounded-lg bg-muted text-xs text-muted-foreground">
              💡 Підтримується Google Chrome та Microsoft Edge. Застосунок відкривається без вкладок браузера
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}