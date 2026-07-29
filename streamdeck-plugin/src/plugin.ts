import streamDeck from '@elgato/streamdeck'
import { ToggleTimer } from './actions/toggle-timer'

streamDeck.actions.registerAction(new ToggleTimer())
await streamDeck.connect()
