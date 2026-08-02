import streamDeck from '@elgato/streamdeck'
import { ToggleTimer } from './actions/toggle-timer'
import { TimerDial } from './actions/timer-dial'

streamDeck.actions.registerAction(new ToggleTimer())
streamDeck.actions.registerAction(new TimerDial())
await streamDeck.connect()
