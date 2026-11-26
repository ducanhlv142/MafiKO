import type {
    SupportedCurrencyCode,
} from "../../domain/finance/currency";

import {
    listSupportedCurrencies,
} from "../../domain/finance/currency.js";

export function populateCurrencySelect(
    select: HTMLSelectElement,
    defaultCurrency?: SupportedCurrencyCode
): void {

    const currencies = listSupportedCurrencies();

    const selected =
        defaultCurrency ?? currencies[0];

    const options = currencies.map(currency => {

        const isDefault = currency === selected;

        return new Option(
            currency,
            currency,
            isDefault,
            isDefault
        );
    });

    select.replaceChildren(...options);
}