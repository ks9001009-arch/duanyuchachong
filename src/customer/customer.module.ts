import { Module } from '@nestjs/common';
import { CustomerRegistryService } from './customer-registry.service';
import { CounterModule } from '../counter/counter.module';
import { AppConfigService } from '../config/app-config.service';

@Module({
  imports: [CounterModule],
  providers: [CustomerRegistryService, AppConfigService],
  exports: [CustomerRegistryService, AppConfigService],
})
export class CustomerModule {}
