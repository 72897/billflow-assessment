/**
 * Money parsing and formatting.
 *
 * These are the boundaries where a string becomes an integer and back again, so
 * they carry the whole no-floating-point rule: if `parseDecimalToMinor` is right,
 * nothing downstream can accumulate a rounding error.
 */

import { describe, expect, it } from 'vitest'
import {
  formatAmount,
  formatAmountExact,
  formatCompactAmount,
  formatMoney,
  formatMoneySymbol,
  formatQuantity,
  formatRate,
  fromDecimal,
  parseDecimalToMinor,
  parseQuantityToThousandths,
  parseRateToBasisPoints,
  quantityToDecimal,
  sumInWords,
  toDecimal,
} from '@/lib/money'

describe('parseDecimalToMinor', () => {
  it('reads the shapes a person actually types', () => {
    expect(parseDecimalToMinor('25000')).toBe(2_500_000)
    expect(parseDecimalToMinor('25000.5')).toBe(2_500_050)
    expect(parseDecimalToMinor('25000.55')).toBe(2_500_055)
    expect(parseDecimalToMinor('1,23,456.78')).toBe(12_345_678)
    expect(parseDecimalToMinor('₹ 1234.50')).toBe(123_450)
    expect(parseDecimalToMinor('.5')).toBe(50)
    expect(parseDecimalToMinor('0')).toBe(0)
    expect(parseDecimalToMinor('-40')).toBe(-4000)
    expect(parseDecimalToMinor(1234.5)).toBe(123_450)
  })

  it('rounds half-up on the first dropped digit', () => {
    expect(parseDecimalToMinor('1.005')).toBe(101)
    expect(parseDecimalToMinor('1.004')).toBe(100)
    expect(parseDecimalToMinor('9.999')).toBe(1000)
    expect(parseDecimalToMinor('-1.005')).toBe(-101)
  })

  it('returns null rather than NaN for anything that is not a number', () => {
    for (const input of ['', 'abc', '12abc', '1.2.3', '--4', null, undefined, {}, NaN, Infinity]) {
      expect(parseDecimalToMinor(input as unknown)).toBeNull()
    }
  })

  it('refuses values that would lose integer precision', () => {
    expect(parseDecimalToMinor('999999999999999999999')).toBeNull()
  })

  it('carries quantities at three decimals and rates at two', () => {
    expect(parseQuantityToThousandths('1.5')).toBe(1500)
    expect(parseQuantityToThousandths('0.25')).toBe(250)
    expect(parseQuantityToThousandths('3.5')).toBe(3500)
    expect(parseQuantityToThousandths('2')).toBe(2000)
    expect(parseRateToBasisPoints('18')).toBe(1800)
    expect(parseRateToBasisPoints('18.5')).toBe(1850)
    expect(parseRateToBasisPoints('0')).toBe(0)
  })
})

describe('round-tripping through the database representation', () => {
  it('renders minor units as the numeric string Postgres stores', () => {
    expect(toDecimal(5_900_000)).toBe('59000.00')
    expect(toDecimal(50)).toBe('0.50')
    expect(toDecimal(5)).toBe('0.05')
    expect(toDecimal(0)).toBe('0.00')
    expect(toDecimal(-12_345)).toBe('-123.45')
    expect(quantityToDecimal(3500)).toBe('3.500')
    expect(quantityToDecimal(1)).toBe('0.001')
  })

  it('survives a full write-then-read cycle unchanged', () => {
    for (const minor of [0, 1, 99, 100, 123_456_789, 5_900_000, -4200]) {
      expect(fromDecimal(toDecimal(minor))).toBe(minor)
    }
  })

  it('throws on a malformed amount instead of storing nonsense', () => {
    expect(() => fromDecimal('not-money')).toThrow(/monetary amount/i)
    expect(fromDecimal(null)).toBe(0)
    expect(fromDecimal(undefined)).toBe(0)
  })
})
describe('formatting', () => {
  it('groups INR the Indian way and hides empty decimals', () => {
    expect(formatAmount(6_490_000, 'INR')).toBe('64,900')
    expect(formatAmount(18_450_000, 'INR')).toBe('1,84,500')
    expect(formatAmount(6_490_050, 'INR')).toBe('64,900.50')
    expect(formatMoney(6_490_000, 'INR')).toBe('INR 64,900')
    expect(formatMoneySymbol(6_490_000, 'INR')).toBe('₹64,900')
  })

  it('groups USD and EUR by their own locales', () => {
    expect(formatAmount(123_456_789, 'USD')).toBe('1,234,567.89')
    expect(formatMoney(450_000, 'USD')).toBe('USD 4,500')
    expect(formatMoneySymbol(450_000, 'USD')).toBe('$4,500')
  })

  it('always shows two decimals on the PDF', () => {
    expect(formatAmountExact(6_490_000, 'INR')).toBe('64,900.00')
    expect(formatAmountExact(50, 'INR')).toBe('0.50')
  })

  it('shortens axis labels', () => {
    expect(formatCompactAmount(0)).toBe('0')
    expect(formatCompactAmount(450_000)).toBe('4.5K')
    expect(formatCompactAmount(12_000_000)).toBe('1.2L')
    expect(formatCompactAmount(2_500_000_000)).toBe('2.5Cr')
  })

  it('drops trailing zero noise from quantities and rates', () => {
    expect(formatQuantity(2000)).toBe('2')
    expect(formatQuantity(1500)).toBe('1.5')
    expect(formatQuantity(250)).toBe('0.25')
    expect(formatRate(1800)).toBe('18')
    expect(formatRate(1850)).toBe('18.5')
    expect(formatRate(0)).toBe('0')
  })

  it('writes the amount in words for the invoice footer', () => {
    expect(sumInWords(5_900_000, 'INR')).toMatch(/fifty-nine thousand/i)
    expect(sumInWords(0, 'INR')).toMatch(/zero/i)
    expect(sumInWords(10_050, 'INR')).toMatch(/fifty paise/i)
  })
})
