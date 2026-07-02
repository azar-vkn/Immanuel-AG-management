import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getTodaysBirthdays,
  getTodaysAnniversaries,
  getUpcomingBirthdays,
  getUpcomingAnniversaries,
} from './automationService';
import { Member } from '@/types';

// Helper to create members easily for testing
const createMember = (overrides: Partial<Member>): Member => ({
  id: '1',
  name: 'Test Member',
  phone: '9876543210',
  status: 'regular',
  ...overrides,
} as Member);

describe('automationService - Member Queries', () => {
  beforeEach(() => {
    // Mock the current date to a fixed value: June 15, 2024
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getTodaysBirthdays', () => {
    it('returns members whose birthday is exactly today (ignoring year)', () => {
      const members = [
        createMember({ id: '1', name: 'Alice', dob: '1990-06-15' }), // Match
        createMember({ id: '2', name: 'Bob', dob: '1985-06-16' }),   // Tomorrow
        createMember({ id: '3', name: 'Charlie', dob: '1992-05-15' }),// Last month
      ];

      const result = getTodaysBirthdays(members);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Alice');
    });

    it('ignores expired or left members', () => {
      const members = [
        createMember({ id: '1', name: 'Alice', dob: '1990-06-15', status: 'left' }),
        createMember({ id: '2', name: 'Bob', dob: '1985-06-15', status: 'expired' }),
      ];
      const result = getTodaysBirthdays(members);
      expect(result).toHaveLength(0);
    });
  });

  describe('getTodaysAnniversaries', () => {
    it('returns members whose anniversary is exactly today (ignoring year)', () => {
      const members = [
        createMember({ id: '1', name: 'Alice', anniversaryDate: '2020-06-15' }), // Match
        createMember({ id: '2', name: 'Bob', anniversaryDate: '2015-06-14' }),   // Yesterday
      ];

      const result = getTodaysAnniversaries(members);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Alice');
    });
  });

  describe('getUpcomingBirthdays', () => {
    it('returns members with birthdays in the specified upcoming days', () => {
      const members = [
        createMember({ id: '1', name: 'Alice', dob: '1990-06-16' }), // 1 day
        createMember({ id: '2', name: 'Bob', dob: '1985-06-20' }),   // 5 days
        createMember({ id: '3', name: 'Charlie', dob: '1992-06-25' }),// 10 days
      ];

      // Default 7 days
      const result7 = getUpcomingBirthdays(members);
      expect(result7).toHaveLength(2); // Alice & Bob

      // Custom 14 days
      const result14 = getUpcomingBirthdays(members, 14);
      expect(result14).toHaveLength(3); // Alice, Bob & Charlie
    });

    it('handles birthdays wrapping around to the next year', () => {
      // Set date to Dec 28
      vi.setSystemTime(new Date('2024-12-28T10:00:00Z'));
      
      const members = [
        createMember({ id: '1', name: 'Alice', dob: '1990-01-02' }), // 5 days away (next year)
      ];

      const result = getUpcomingBirthdays(members, 7);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Alice');
    });
  });

  describe('getUpcomingAnniversaries', () => {
    it('returns members with anniversaries in the upcoming days', () => {
      const members = [
        createMember({ id: '1', name: 'Alice', anniversaryDate: '2010-06-18' }), // 3 days away
        createMember({ id: '2', name: 'Bob', anniversaryDate: '2015-06-10' }),   // 5 days ago
      ];

      const result = getUpcomingAnniversaries(members, 7);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Alice');
    });
  });
});
