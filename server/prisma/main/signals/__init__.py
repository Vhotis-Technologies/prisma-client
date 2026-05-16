"""
Import all signal modules so their @receiver handlers are registered with Django.

Submodules: vehicle_signal (booking completion, loyalty, notifications),
user_signal (referral rewards), partner_signal (commission on booking),
fleet_signal (trial activation, branch admin flag), winner_voucher_signal,
gift_voucher_signal.
"""
from . import fleet_signal
from . import gift_voucher_signal
from . import partner_signal
from . import user_signal
from . import vehicle_signal
from . import winner_voucher_signal
