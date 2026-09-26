package si.atejzu.countryexplorer.common.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import java.util.List;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.cache.CacheManager;
import org.springframework.cache.caffeine.CaffeineCache;
import org.springframework.cache.support.SimpleCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(CountryCacheProperties.class)
public class CacheConfig {
    @Bean
    CacheManager cacheManager(CountryCacheProperties properties) {
        var manager = new SimpleCacheManager();
        manager.setCaches(List.of(
                new CaffeineCache("countryCatalog", Caffeine.newBuilder().recordStats()
                        .expireAfterWrite(properties.catalogueTtl()).maximumSize(1).build(), false),
                new CaffeineCache("countryDetails", Caffeine.newBuilder().recordStats()
                        .expireAfterWrite(properties.detailsTtl()).maximumSize(properties.detailsMaximumSize()).build(), false)));
        return manager;
    }
}
