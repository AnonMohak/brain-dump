export const EXAMPLE_DUMP = `ok brain is full. need to finish the slides for thursday's client demo, and jake's PR has been waiting since monday. dentist appointment friday at 4:30, don't forget!! the kitchen tap is dripping again — call a plumber? also mom's birthday is on the 23rd, order flowers. should we move standups to async slack updates? what's the deadline for the tax filing this year. maybe build a tiny app that turns voice memos into a weekly journal someday. buy coffee and dish soap.`

/** Sample dumps for the first-run screen. */
export const EXAMPLES: { key: string; title: string; blurb: string; text: string }[] = [
  {
    key: 'week',
    title: 'A busy week',
    blurb: 'Work, a dentist, a dripping tap',
    text: EXAMPLE_DUMP,
  },
  {
    key: 'admin',
    title: 'Life admin',
    blurb: 'Bills, renewals, questions',
    text: `rent is due on the 1st. car insurance renews end of the month, compare quotes first. passport expires in march?? renew it. electricity bill tonight. should i switch banks, the fees are silly. call grandma on sunday. book a haircut. what's the deadline for the tax filing this year`,
  },
  {
    key: 'mixed',
    title: 'Mixed language',
    blurb: 'Hinglish in, English out',
    text: `kal doctor ke paas jaana hai 5 baje, aur bijli ka bill bharna hai by friday. sam se poochna hai about the goa trip dates. maybe ek youtube channel start karu cooking pe? ghar ke liye sabzi aur doodh lena hai`,
  },
]
