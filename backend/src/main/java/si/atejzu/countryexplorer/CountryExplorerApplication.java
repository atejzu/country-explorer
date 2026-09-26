package si.atejzu.countryexplorer;

import java.util.TimeZone;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration;

// Account authentication is added in a later phase; do not generate a default user.
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
public class CountryExplorerApplication {

	public static void main(String[] args) {
		TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
		SpringApplication.run(CountryExplorerApplication.class, args);
	}

}
