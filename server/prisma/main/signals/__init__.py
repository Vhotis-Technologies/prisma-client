"""
Import all signal modules so their @receiver handlers are registered with Django.

Submodules: vehicle (booking completion, loyalty, notifications), user (referral rewards),
partner (commission on booking, reverse on refund), fleet (trial activation, branch admin flag).
"""
# Import all signal modules to register handlers
from . import vehicle
from . import user
from . import partner
from . import fleet
from . import winner_voucher
