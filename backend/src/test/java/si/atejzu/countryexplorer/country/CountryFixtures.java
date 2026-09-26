package si.atejzu.countryexplorer.country;

final class CountryFixtures {
    static final String SLOVENIA = """
            {"codes":{"alpha_3":"SVN"},
             "names":{"common":"Slovenia","official":"Republic of Slovenia",
                      "translations":{"slv":{"common":"Slovenija","official":"Republika Slovenija"}}},
             "capitals":[{"name":"Other"},{"name":"Ljubljana","attributes":{"primary":true}}],
             "population":2100000,"region":"Europe","subregion":"Central Europe",
             "area":{"kilometers":20273.0},"coordinates":{"lat":46.1167,"lng":14.8167},
             "currencies":[{"code":"EUR","name":"Euro","symbol":"€"}],
             "languages":[{"bcp47":"sl","name":"Slovene"}],
             "timezones":["UTC+01:00"],"borders":["AUT","HRV","ITA","HUN"],
             "calling_codes":["386","+387"],"cars":{"driving_side":"right"},
             "flag":{"url_png":"https://example.test/si.png","url_svg":"https://example.test/si.svg","description":"English alt"}}
            """;

    static String page(String objects, int total, int count, int offset, boolean more) {
        return "{\"data\":{\"objects\":[" + objects + "],\"meta\":{\"total\":" + total
                + ",\"count\":" + count + ",\"limit\":100,\"offset\":" + offset + ",\"more\":" + more + "}}}";
    }
}
